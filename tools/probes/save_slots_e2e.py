"""End-to-end probe for save slots (ROADMAP §12) against a real server process + real SQLite.

Run by tools/probes/run_save_slots_e2e.sh, which boots `server/index.ts` on a spare port first. Every
claim the feature makes is asserted here rather than assumed: the slot captures story state, the list
doesn't ship whole transcripts, restoring produces a NEW chat (COPY, not move), message rows get fresh
keys, and the source chat is byte-identical afterwards.
"""
import json
import os
import pathlib
import sqlite3
import sys
import urllib.error
import urllib.request

BASE = f'http://127.0.0.1:{os.environ.get("PORT", "3123")}/api'
DB = str(pathlib.Path(__file__).resolve().parents[2] / 'data' / 'rp.db')

# This host exports HTTP_PROXY/HTTPS_PROXY, and urllib honours them — which turns a request to our
# own loopback server into a 502 from the upstream proxy. Bypass proxies explicitly (the same trap
# curl dodges for localhost, and the one this repo's ops notes already flag for local HTTP probes).
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

results = []


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={'Content-Type': 'application/json'} if data else {},
    )
    try:
        with _opener.open(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw[:200]


def check(label, cond, detail=''):
    results.append((label, bool(cond)))
    print(('PASS  ' if cond else 'FAIL  ') + label + (f'  [{detail}]' if detail else ''))


# 0. the table exists in the real schema, created by the server process itself
conn = sqlite3.connect(DB)
tables = {r[0] for r in conn.execute("select name from sqlite_master where type='table'")}
check('save_slots 表由服务端建出', 'save_slots' in tables, sorted(t for t in tables if 'slot' in t))
cols = [r[1] for r in conn.execute('pragma table_info(save_slots)')]
check('表列齐全（id/chatId/createdAt/data）', set(cols) >= {'id', 'chatId', 'createdAt', 'data'}, cols)
conn.close()

# 1. a character to hang a scratch chat off
st, chars = call('GET', '/characters')
check('服务在跑且有角色可用', st == 200 and isinstance(chars, list) and len(chars) > 0, f'status={st} n={len(chars) if isinstance(chars, list) else chars}')
cid = chars[0]['id']

# 2. scratch chat + two messages
st, chat = call('POST', '/chats', {'characterId': cid, 'personaId': '', 'title': '[probe] slot e2e'})
check('建临时聊天', st == 201 and bool(chat.get('id')), f'status={st}')
chat_id = chat['id']
mids = []
for txt in ('first probe line', 'second probe line'):
    st, m = call('POST', '/messages', {'chatId': chat_id, 'role': 'user', 'content': txt})
    mids.append(m['id'])
check('写两条消息', st == 201 and len(set(mids)) == 2, mids)

# 3. snapshot it
st, slot = call('POST', '/save-slots', {'chatId': chat_id, 'name': '[probe] mid-scene'})
check('建档槽返回 201', st == 201, f'status={st}')
check('槽的 counts 反映真实消息数', (slot.get('counts') or {}).get('messages') == 2, slot.get('counts'))
slot_id = slot['id']

# 4. a missing name is refused, not silently accepted
st, _ = call('POST', '/save-slots', {'chatId': chat_id, 'name': '   '})
check('空名被拒（400）', st == 400, f'status={st}')

# 5. list omits the snapshot payload
st, listed = call('GET', '/save-slots')
row = [s for s in listed if s['id'] == slot_id]
check('列表含该槽', len(row) == 1, f'{len(listed)} 槽')
check('列表不带 snapshot（整段记录不回传前端）', bool(row) and 'snapshot' not in row[0], sorted(row[0].keys()) if row else '')

# 6. filter by chat
st, only = call('GET', f'/save-slots?chatId={chat_id}')
check('可按聊天过滤', st == 200 and all(s['chatId'] == chat_id for s in only), f'{len(only)} 条')

# 7. source state before restore
_, src_before = call('GET', f'/chats/{chat_id}')
_, src_msgs_before = call('GET', f'/chats/{chat_id}/messages')

# 8. restore
st, restored = call('POST', f'/save-slots/{slot_id}/restore')
check('恢复返回 201', st == 201, f'status={st} body={restored if st != 201 else ""}')
check('恢复生成新聊天（非原地覆盖源聊天）', restored.get('id') != chat_id, restored.get('id'))
check('新聊天记录来源槽 id', restored.get('restoredFromSlotId') == slot_id, restored.get('restoredFromSlotId'))
check('新聊天父子链指向源聊天（分支树可见血统）', restored.get('parentChatId') == chat_id, restored.get('parentChatId'))
check('新聊天标题=槽名', restored.get('title') == '[probe] mid-scene', restored.get('title'))

# 9. messages copied under fresh keys
_, msgs_new = call('GET', f"/chats/{restored['id']}/messages")
new_ids = [m['id'] for m in msgs_new]
check('消息被复制到新聊天', len(msgs_new) == 2, f'{len(msgs_new)} 条')
check('复制产生新主键（不是搬移原行）', set(new_ids).isdisjoint(set(mids)), f'new={new_ids} old={mids}')
check('消息内容一致', sorted(m['content'] for m in msgs_new) == ['first probe line', 'second probe line'])

# 10. the source chat is untouched — the whole point of COPY-not-move
_, src_after = call('GET', f'/chats/{chat_id}')
_, src_msgs_after = call('GET', f'/chats/{chat_id}/messages')
check('源聊天行未被改动', src_before == src_after, '')
check('源消息行数与主键未被改动', [m['id'] for m in src_msgs_before] == [m['id'] for m in src_msgs_after], '')

# 11. a slot is reusable, not consumed by one restore
st, again = call('POST', f'/save-slots/{slot_id}/restore')
check('同一槽可重复恢复', st == 201 and again['id'] not in (chat_id, restored['id']), f'status={st}')

# 12. lineage resolution — the case the first run of this probe got wrong
_, fork_slot = call('POST', '/save-slots', {'chatId': again['id'], 'name': '[probe] lineage'})
call('DELETE', f"/chats/{again['id']}/purge")  # immediate source gone, grandparent (chat_id) still alive
st, forked = call('POST', f"/save-slots/{fork_slot['id']}/restore")
check('源聊天已删后仍可恢复', st == 201, f'status={st}')
check('近亲已删、祖辈仍在 → 血统接到祖辈（不丢历史）', st == 201 and forked.get('parentChatId') == chat_id, forked.get('parentChatId') if st == 201 else st)

# 13. every ancestor purged — nothing dangling may be written
p1 = call('DELETE', f'/chats/{chat_id}/purge')[0]
p2 = call('DELETE', f"/chats/{restored['id']}/purge")[0]
print(f'   [debug] purge source={p1} purge first-restore={p2}')
_, dbg = call('GET', '/chats')
print('   [debug] alive chats:', [(c['id'][:8], (c.get('parentChatId') or '-')[:8], c['title']) for c in dbg])
print(f"   [debug] slot.chatId={fork_slot['chatId'][:8]} source_alive={any(c['id'] == chat_id for c in dbg)}")
st, rootless = call('POST', f"/save-slots/{fork_slot['id']}/restore")
print(f"   [debug] rootless.parentChatId={rootless.get('parentChatId') if st == 201 else st}")
check('全部祖辈已删 → 不写 parentChatId（无悬空父）', st == 201 and not rootless.get('parentChatId'), rootless.get('parentChatId') if st == 201 else st)

# cleanup
for c in (chat_id, restored['id'], again['id'], forked.get('id'), rootless.get('id')):
    if c:
        call('DELETE', f'/chats/{c}/purge')
call('DELETE', f'/save-slots/{slot_id}')
call('DELETE', f"/save-slots/{fork_slot['id']}")
_, final_slots = call('GET', '/save-slots')
_, final_chats = call('GET', '/chats')
probe_ids = {chat_id, restored['id'], again['id'], forked.get('id'), rootless.get('id')}
check('清理：无残留槽', all(s['id'] not in (slot_id, fork_slot['id']) for s in final_slots), f'{len(final_slots)} 槽剩余')
check('清理：无残留探针聊天', all(c['id'] not in probe_ids for c in final_chats), f'{len(final_chats)} 聊天剩余')

ok = sum(1 for _, c in results if c)
print(f'\n=== {ok}/{len(results)} 断言通过 ===')
sys.exit(0 if ok == len(results) else 1)
