# Graph Report - koibito-ai-src  (2026-09-13)

## Corpus Check
- 448 files · ~4,309,940 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2904 nodes · 8715 edges · 150 communities (133 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 63 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `048d91be`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- useChatSession.ts
- calendar.ts
- VNStage.tsx
- RelationshipPanel.tsx
- useSettingsStore
- slop.ts
- Modal.tsx
- WelcomeView.tsx
- createImageBackend.ts
- slashCommands.ts
- ambientEvents.ts
- outfits.ts
- CharacterEditor.tsx
- intimacyStages.ts
- byaf.ts
- IntimacyScene
- createChat.ts
- useAssistant.ts
- intimacyScene.ts
- chatBackend.ts
- app.ts
- cardSpec.ts
- BgmPlayer.tsx
- sceneVision.ts
- continuityGuard.ts
- detectBackend.ts
- aiAssist.ts
- exportWithGrowth.ts
- gifts.ts
- scenarios.ts
- ChatMessage
- useSettingsStore.ts
- RP Suite Roadmap
- seedContent.ts
- openMayhemMedia.ts
- lib/types.ts
- voice.ts
- sceneParticipants.ts
- 开发计划（koibito-ai）
- epub.ts
- triggers.ts
- GenerateCharacterDialog.tsx
- BagPanel.tsx
- SamplingControls.tsx
- NovelAIClient
- OpenAICompatibleClient
- compilerOptions
- db.ts
- arousal.ts
- compilerOptions
- toastError
- api/openMayhem.ts
- chatJsonl.ts
- png.ts
- relationshipAssist.ts
- make-sprites.mjs
- aftercare.ts
- activation.ts
- detector.ts
- intimacyCatalog.ts
- jsonRepair.ts
- workSchedule.ts
- devDependencies
- avatars.ts
- estimateTokens
- CharacterEditor
- dependencies
- SettingsView.tsx
- useChatSession
- ChatWindow.tsx
- calendar.test.ts
- lib.mjs
- builder.ts
- outreach.ts
- participantArchetype.ts
- momentum.ts
- What's in it
- immersionPreset.ts
- InstructTemplateSection.tsx
- boundaryGuard.ts
- plans.ts
- P2-6 动态客串 NPC —— 设计书（先设计，后落刀）
- sceneTag.ts
- beliefs.ts
- expectations.ts
- messageSegments.ts
- compilerOptions
- summarize.ts
- make-backgrounds.mjs
- FP 吸收计划与项目状态（中文版工作文档）
- originCheck.ts
- worldTemplates.ts
- sillyTavernPreset.ts
- ttsProviders.ts
- RP Suite — TODO
- scripts
- RP Suite / koibito-ai — 项目现状
- placeholder.ts
- generateFullCharacter.ts
- importExport.ts
- llmProxy.ts
- novelaiTokenizer.ts
- cgTrigger.ts
- touch.ts
- multiParticipantScene.test.ts
- rebuff.ts
- rapport.ts
- rp asset generation — ComfyUI + Anima
- OpenMayhem integration
- builder.test.ts
- dayPlanner.ts
- vnProse.ts
- RP Suite
- coinMutex.ts
- count_chaos_pool.py
- Running RP Suite in Docker
- package.json
- ColorField.tsx
- generationLock.ts
- SwarmUIClient
- article.ts
- regexSafety.ts
- tools/audit — 文档 × 代码对账工具
- api/types.ts
- tokenCache.ts
- audio/sfx.ts
- buildSteerDirective
- sceneContinuity.ts
- check_pre_commit.py
- count_scale.py
- stt.test.ts
- vad.ts
- check_gaps.py
- sentenceChunker.ts
- check_doc_refs.py
- dump_open_items.py
- scan_cjk_pollution.py
- concurrently
- tsx
- @types/node
- vite-plugin-pwa
- OpenMayhemImageClient
- _matte.py
- autoprefixer

## God Nodes (most connected - your core abstractions)
1. `useChatSession()` - 259 edges
2. `useSettingsStore` - 80 edges
3. `Character` - 56 edges
4. `useApiQuery()` - 56 edges
5. `toastError()` - 52 edges
6. `WorldCard` - 47 edges
7. `RelationshipPanel()` - 45 edges
8. `CharacterEditor()` - 44 edges
9. `t()` - 44 edges
10. `errorMessage()` - 43 edges

## Surprising Connections (you probably didn't know these)
- `cells` --calls--> `sceneGradient()`  [EXTRACTED]
  scripts/vn-gradient-swatches.mts → src/lib/vn/placeholder.ts
- `RelationshipPanel()` --indirect_call--> `chaosSpicyEnabled()`  [INFERRED]
  src/components/chat/RelationshipPanel.tsx → src/lib/realism/engine.ts
- `WorldEditor()` --indirect_call--> `describeAction()`  [INFERRED]
  src/components/worlds/WorldsView.tsx → src/lib/world/triggers.ts
- `WorldEditor()` --indirect_call--> `describeCondition()`  [INFERRED]
  src/components/worlds/WorldsView.tsx → src/lib/world/triggers.ts
- `useOpenMayhemModels()` --indirect_call--> `hasAvailableOpenMayhemProvider()`  [INFERRED]
  src/lib/hooks/useOpenMayhemModels.ts → src/lib/api/openMayhem.ts

## Import Cycles
- 3-file cycle: `src/lib/dating/intimacyCatalog.ts -> src/lib/dating/stage.ts -> src/lib/dating/intimacyScene.ts -> src/lib/dating/intimacyCatalog.ts`
- 3-file cycle: `src/lib/dating/intimacyCatalog.ts -> src/lib/types.ts -> src/lib/dating/intimacyScene.ts -> src/lib/dating/intimacyCatalog.ts`
- 3-file cycle: `src/lib/dating/intimacyCatalog.ts -> src/lib/types.ts -> src/lib/dating/intimacyStages.ts -> src/lib/dating/intimacyCatalog.ts`
- 3-file cycle: `src/lib/dating/aftercare.ts -> src/lib/dating/relationshipAssist.ts -> src/lib/dating/intimacyScene.ts -> src/lib/dating/aftercare.ts`
- 3-file cycle: `src/lib/dating/aftercare.ts -> src/lib/dating/relationshipAssist.ts -> src/lib/types.ts -> src/lib/dating/aftercare.ts`
- 3-file cycle: `src/lib/dating/intimacyStages.ts -> src/lib/store/useSettingsStore.ts -> src/lib/types.ts -> src/lib/dating/intimacyStages.ts`
- 3-file cycle: `src/lib/dating/stage.ts -> src/lib/types.ts -> src/lib/world/triggers.ts -> src/lib/dating/stage.ts`
- 4-file cycle: `src/lib/characters/cardSpec.ts -> src/lib/dating/intimacyScene.ts -> src/lib/dating/intimacyCatalog.ts -> src/lib/dating/stage.ts -> src/lib/characters/cardSpec.ts`
- 4-file cycle: `src/lib/dating/intimacyCatalog.ts -> src/lib/dating/stage.ts -> src/lib/dating/intimacyScene.ts -> src/lib/dating/intimacyStages.ts -> src/lib/dating/intimacyCatalog.ts`
- 4-file cycle: `src/lib/dating/intimacyCatalog.ts -> src/lib/dating/stage.ts -> src/lib/types.ts -> src/lib/dating/intimacyScene.ts -> src/lib/dating/intimacyCatalog.ts`
- 4-file cycle: `src/lib/dating/intimacyCatalog.ts -> src/lib/dating/stage.ts -> src/lib/types.ts -> src/lib/dating/intimacyStages.ts -> src/lib/dating/intimacyCatalog.ts`
- 4-file cycle: `src/lib/dating/intimacyCatalog.ts -> src/lib/store/useSettingsStore.ts -> src/lib/dating/relationshipAssist.ts -> src/lib/dating/intimacyScene.ts -> src/lib/dating/intimacyCatalog.ts`
- 4-file cycle: `src/lib/dating/intimacyCatalog.ts -> src/lib/store/useSettingsStore.ts -> src/lib/text/slop.ts -> src/lib/dating/intimacyScene.ts -> src/lib/dating/intimacyCatalog.ts`
- 4-file cycle: `src/lib/dating/intimacyCatalog.ts -> src/lib/store/useSettingsStore.ts -> src/lib/types.ts -> src/lib/dating/intimacyScene.ts -> src/lib/dating/intimacyCatalog.ts`
- 4-file cycle: `src/lib/dating/intimacyCatalog.ts -> src/lib/store/useSettingsStore.ts -> src/lib/types.ts -> src/lib/dating/intimacyStages.ts -> src/lib/dating/intimacyCatalog.ts`
- 4-file cycle: `src/lib/dating/intimacyCatalog.ts -> src/lib/types.ts -> src/lib/dating/intimacyScene.ts -> src/lib/dating/intimacyStages.ts -> src/lib/dating/intimacyCatalog.ts`
- 4-file cycle: `src/lib/dating/aftercare.ts -> src/lib/dating/relationshipAssist.ts -> src/lib/realism/engine.ts -> src/lib/types.ts -> src/lib/dating/aftercare.ts`
- 4-file cycle: `src/lib/characters/cardSpec.ts -> src/lib/dating/intimacyScene.ts -> src/lib/dating/aftercare.ts -> src/lib/dating/relationshipAssist.ts -> src/lib/characters/cardSpec.ts`
- 4-file cycle: `src/lib/characters/cardSpec.ts -> src/lib/types.ts -> src/lib/dating/aftercare.ts -> src/lib/dating/relationshipAssist.ts -> src/lib/characters/cardSpec.ts`
- 4-file cycle: `src/lib/dating/aftercare.ts -> src/lib/dating/relationshipAssist.ts -> src/lib/dating/beliefs.ts -> src/lib/types.ts -> src/lib/dating/aftercare.ts`

## Communities (150 total, 17 thin omitted)

### Community 0 - "useChatSession.ts"
Cohesion: 0.08
Nodes (44): GenerationHud(), RealismCard(), objectivesApi, GenerationStats, addJournalFromTurn(), applyNeedsDelta(), applyPromiseOps(), applyRepair() (+36 more)

### Community 1 - "calendar.ts"
Cohesion: 0.07
Nodes (32): AdvancedClock, ALL_HOLIDAYS, CalendarInfo, clampPhaseIndex(), DAY_SKIP_CUES, DAYS_PER_SEASON, DAYS_PER_YEAR, deriveElapsedPhases() (+24 more)

### Community 2 - "VNStage.tsx"
Cohesion: 0.07
Nodes (27): CHIP_CLASSES, ChoiceList(), ChoiceListProps, GIFT_NAME_CLASSES, KIND_ICON, KIND_ICON_CLASSES, REFRESH_CLASSES, ReactivePortrait() (+19 more)

### Community 3 - "RelationshipPanel.tsx"
Cohesion: 0.08
Nodes (58): DIMENSION_LABELS, DirectorPanel(), PLAN_KIND_LABELS, ALL_STAT_KEYS, DIMENSION_LABELS, formatDeltas(), INTIMACY_CATEGORIES, PanelTab (+50 more)

### Community 4 - "useSettingsStore"
Cohesion: 0.06
Nodes (65): App(), ChatSurface(), CharacterList(), CharactersView(), RegenerateFieldButton(), GlobalBgm(), NewChatDialog(), ObjectivePanelProps (+57 more)

### Community 5 - "slop.ts"
Cohesion: 0.06
Nodes (53): BuildGrowthInput, EXPLICIT_ANTI_PATTERNS, balanceTrailingMarkup(), buildSlopAvoidanceNote(), cleanModelOutput(), CleanModelOutputOptions, DuplicateRateReport, EchoMatch (+45 more)

### Community 6 - "Modal.tsx"
Cohesion: 0.11
Nodes (18): POLICIES, ScenePanel(), TIME_OF_DAY, KeyboardShortcutsSheet(), SHORTCUTS, ConfirmDialog(), Modal(), ModalProps (+10 more)

### Community 7 - "WelcomeView.tsx"
Cohesion: 0.13
Nodes (25): ConnectionBadge(), COMMON_LOCAL_URLS, HOSTED_PROVIDER_OPTIONS, isLoopbackUrl(), LOCAL_PROVIDER_IDS, normalizeUrl(), WelcomeView(), BUILTIN_IDS (+17 more)

### Community 8 - "createImageBackend.ts"
Cohesion: 0.09
Nodes (20): A1111Client, BASE_PARAMS, extractFirstFileFromZip(), uint8ArrayToBase64(), buildDefaultWorkflow(), ComfyNode, ComfyUIClient, ComfyWorkflow (+12 more)

### Community 9 - "slashCommands.ts"
Cohesion: 0.07
Nodes (42): Composer(), ComposerProps, collectImageBase64(), composeMessageText(), PendingAttachment, PendingFileAttachment, PendingImageAttachment, readAttachment() (+34 more)

### Community 10 - "ambientEvents.ts"
Cohesion: 0.15
Nodes (25): evaluateOutreach(), AMBIENT_EVENT_KINDS, AmbientEvent, AmbientEventContext, ambientEventGuidance(), AmbientEventKind, describeAmbientEvent(), describeSocialReaction() (+17 more)

### Community 11 - "outfits.ts"
Cohesion: 0.15
Nodes (24): slugifyId(), DEFAULT_EXPRESSION_IDS, DEFAULT_EXPRESSIONS, EXPRESSION_FALLBACKS, expressionCandidatesFor(), ExpressionOption, slugifyExpressionId(), SpriteVariantOptions (+16 more)

### Community 12 - "CharacterEditor.tsx"
Cohesion: 0.07
Nodes (50): composeKinkProfile(), composeTouchProfile(), parseKinks(), parseList(), parseRegions(), TABS, ExpressionOption, GenerateExpressionSetDialog() (+42 more)

### Community 13 - "intimacyStages.ts"
Cohesion: 0.14
Nodes (23): IntimacyCategory, advanceIntimacyScene(), stageContextFor(), buildPendingChoice(), choiceDefaultDue(), defaultChoiceOption(), edgesOfMode(), eligibleChoiceEdges() (+15 more)

### Community 14 - "byaf.ts"
Cohesion: 0.14
Nodes (34): BYAF_FLAT_MARKERS, byafAlternateGreetings(), byafArchiveCard(), byafCardFields(), byafFlatCard(), ByafImage, byafLoreItemsToBook(), ByafSources (+26 more)

### Community 15 - "IntimacyScene"
Cohesion: 0.30
Nodes (11): ArousalBand, BodyRegion, regionLabel(), ClothingState, IntimacyScene, ContactEdge, arousalLine(), clothingLines() (+3 more)

### Community 16 - "createChat.ts"
Cohesion: 0.12
Nodes (19): availableGreetings(), createChat(), parseGreetingGate(), defaultGiftInventory(), BACKGROUND_ALIASES, backgroundLabel(), BackgroundOption, containsPhrase() (+11 more)

### Community 17 - "useAssistant.ts"
Cohesion: 0.13
Nodes (19): AssistantView(), FRAMES, Spinner(), assistantThreadsApi, CHARACTER_OBJECT, CHARACTER_PATTERNS, detectProducer(), MAKE (+11 more)

### Community 18 - "intimacyScene.ts"
Cohesion: 0.10
Nodes (31): ArousalState, habituatedRegion(), appendSceneShapeLog(), detectExplicitAntiPatternUsed(), EAGER_MOODS, enterStage(), explicitAftercareGuidance(), explicitSceneGuidance() (+23 more)

### Community 19 - "chatBackend.ts"
Cohesion: 0.10
Nodes (15): ChatBackend, ChatBackendConfig, ChatBackendId, KnownChatProvider, ChatBackendSettings, ASSIST_TIMEOUT_MS, joinUrl(), KoboldClient (+7 more)

### Community 20 - "app.ts"
Cohesion: 0.07
Nodes (19): BACKUP_STORES, clientDir, DEFAULT_SCENE_FLAGS, GIFT_RARITIES, normalizeClearableIntimacyLevel(), normalizeIntimacyLevel(), normalizeItemDefs(), normalizeItemEffect() (+11 more)

### Community 21 - "cardSpec.ts"
Cohesion: 0.10
Nodes (27): TemplateGallery(), ByafArchiveImport, BehavioralRule, BehavioralRuleKind, blankCharacterData(), CardAssets, CgTrigger, CharacterCardData (+19 more)

### Community 22 - "BgmPlayer.tsx"
Cohesion: 0.16
Nodes (13): absolute(), BgmPlayer(), clamp01(), playWithUnlock(), BACKGROUND_MOOD_FALLBACK, resolveBgmTrack(), AudioDuckState, useAudioDuckStore (+5 more)

### Community 23 - "sceneVision.ts"
Cohesion: 0.19
Nodes (14): classifyAttachedImageScene(), detectExpressionFromSprites(), detectExpressionTextMismatch(), detectGreetingScene(), escapeRe(), ExpressionCandidate, firstAllowedId(), GREETING_SCENE_PARAMS (+6 more)

### Community 24 - "continuityGuard.ts"
Cohesion: 0.12
Nodes (29): applyClothingRemovals(), CLOTHING_LAYERS, ClothingLayer, ClothingSide, describeClothingSide(), isFullyUndressed(), isLayer(), isRemoved() (+21 more)

### Community 25 - "detectBackend.ts"
Cohesion: 0.25
Nodes (13): DetectedBackend, detectLocalBackend(), fetchOpenAiModelContext(), getJson(), listOpenAiModels(), modelIdsFrom(), openAiCandidates(), strip() (+5 more)

### Community 26 - "aiAssist.ts"
Cohesion: 0.13
Nodes (32): generateWithTimeout(), parseStoryOutline(), planStory(), AiLoreSubject, ASSIST_SAMPLER, CardTextField, contextSummary(), draftCharacterBonds() (+24 more)

### Community 27 - "exportWithGrowth.ts"
Cohesion: 0.15
Nodes (24): buildGrowthSnapshot(), cleanText(), describeGrowthSnapshot(), fitBudget(), GROWTH_BUDGET_BYTES, GROWTH_SNAPSHOT_VERSION, GrowthFactSnapshot, GrowthJournalSnapshot (+16 more)

### Community 28 - "gifts.ts"
Cohesion: 0.14
Nodes (27): appendGiftLog(), BIRTHDAY_GIFT_MULTIPLIER, birthdayGiftGuidance(), DEFAULT_GIFT_CATALOG, GIFT_CADENCE_WINDOW_TURNS, GIFT_LOG_CAP, giftBirthdayMultiplier(), giftById() (+19 more)

### Community 29 - "scenarios.ts"
Cohesion: 0.14
Nodes (18): created, IntimacySceneContext, DEFAULT_SCENARIO, RESOLVE_STAGE, StageContext, validateScenarioGraph(), BRANCHING_SCENARIO, BUILT_IN_SCENARIOS (+10 more)

### Community 30 - "ChatMessage"
Cohesion: 0.16
Nodes (13): DIRECTOR_PARAMS, nextRoundRobinSpeaker(), parseMention(), pickDirectorSpeaker(), rosterFrom(), SceneRoster, roster, ChatMessage (+5 more)

### Community 31 - "useSettingsStore.ts"
Cohesion: 0.11
Nodes (23): PromptSectionsSection(), SECTION_DESCRIPTIONS, SECTION_ORDER, cap(), COLOR_KEYS, DEFAULT_PRESET, matchingPresetId(), ThemeEditor() (+15 more)

### Community 32 - "RP Suite Roadmap"
Cohesion: 0.08
Nodes (25): 0. Quick wins, 10. Major expansion: a living-world dating sim, 10a. World simulation & time, 10b. Live date & hangout conversations, 10c. Relationship depth & lifecycle, 10d. Economy, gifts & items, 10e. Character & world authoring depth, 10f. Proactive, scheduled characters (the core ask) (+17 more)

### Community 33 - "seedContent.ts"
Cohesion: 0.12
Nodes (24): __dirname, seedAssetsDir, seedNightAssetsDir, seedSpritesDir, brenCard, now, SEED_BACKGROUND_KEYS, SEED_BACKGROUND_NIGHT_KEYS (+16 more)

### Community 34 - "openMayhemMedia.ts"
Cohesion: 0.21
Nodes (16): Attribute, openMayhemAttribute(), availableMediaModel(), checkResponse(), Endpoint, generateOpenMayhemMedia(), Job, openMayhemImageBody() (+8 more)

### Community 35 - "lib/types.ts"
Cohesion: 0.08
Nodes (42): CalendarPanelProps, KeyDate, DirectorPanelProps, LiveRapport(), TONE, TONE_VN, MessageLogProps, PinnedMessagesPanel() (+34 more)

### Community 36 - "voice.ts"
Cohesion: 0.12
Nodes (26): bandForWords(), BANDS, BandSpec, collectCharacterTurns(), countProseWords(), deriveCardReplyBand(), DerivedReplyBand, DetectedVoiceFingerprint (+18 more)

### Community 37 - "sceneParticipants.ts"
Cohesion: 0.11
Nodes (31): bandLabel(), SceneStateCard(), SceneStateCardProps, STAGE_KIND_LABEL, StageCard(), StageVariant, BODY_REGIONS, advanceMeters() (+23 more)

### Community 38 - "开发计划（koibito-ai）"
Cohesion: 0.08
Nodes (24): 0. 本次刷新改了什么（为什么刷新）, 10. 参考资源, 11. 贡献指南（继承旧版）, 1. 基线, 2. 冻结清单（**已完成，禁止重做**）, 3. 任务清单, 4. 明确不做（避免反复讨论）, 5. 里程碑 (+16 more)

### Community 39 - "epub.ts"
Cohesion: 0.07
Nodes (38): RFC-4122, base64ToBytes(), buildChatChapters(), buildChatEpub(), buildChatEpubEntries(), ByteSink, chapterXhtml(), chatEpubBlob() (+30 more)

### Community 40 - "triggers.ts"
Cohesion: 0.09
Nodes (31): IntentChips(), KnownFlag, KnownTrigger, TRIGGER_STATS, TriggerActionRows(), TriggerConditionRows(), availableIntents(), BY_ID (+23 more)

### Community 41 - "GenerateCharacterDialog.tsx"
Cohesion: 0.11
Nodes (27): ALL_STAGES, GenerateCharacterDialog(), StageState, STATUS_GLYPH, FullCharacterStage, isAbortError(), OPTIONAL_STAGES, STAGE_LABELS (+19 more)

### Community 42 - "BagPanel.tsx"
Cohesion: 0.13
Nodes (21): BagPanel(), BagPanelProps, CatalogAction(), CatalogCard(), CatalogCardProps, CoinBalance(), catalogIcon(), CatalogTone (+13 more)

### Community 43 - "SamplingControls.tsx"
Cohesion: 0.19
Nodes (19): TuningPanel(), ChatCompletionSamplerSection(), ADVANCED_FIELDS, SamplingControls(), IconButton(), IconButtonProps, TONE_CLASSES, SettingsEyebrow() (+11 more)

### Community 45 - "OpenAICompatibleClient"
Cohesion: 0.21
Nodes (3): ConnectionCheckResult, OpenAICompatibleClient, isOpenMayhem()

### Community 46 - "compilerOptions"
Cohesion: 0.09
Nodes (22): DOM, DOM.Iterable, ES2020, src, compilerOptions, baseUrl, isolatedModules, jsx (+14 more)

### Community 47 - "db.ts"
Cohesion: 0.08
Nodes (24): app, assistantThreadStore, characterStore, chatFactStore, chatStore, checkpointDb(), ColumnSpec, dataDir (+16 more)

### Community 48 - "arousal.ts"
Cohesion: 0.15
Nodes (19): advanceArousal(), AROUSAL_BAND_PHRASE, arousalBandFor(), ArousalContext, BAND_FLOORS, BANDS_HIGH_TO_LOW, CONSENT_TENSION_COMFORT_FLOOR, CONSENT_TENSION_GAP (+11 more)

### Community 49 - "compilerOptions"
Cohesion: 0.09
Nodes (21): ES2022, server, compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, lib, module (+13 more)

### Community 50 - "toastError"
Cohesion: 0.10
Nodes (38): ChatsPanel(), DateEventPanel(), DateEventPanelProps, DayPlannerPanelProps, Avatar(), avatarClass(), MessageBubble, ObjectivePanel() (+30 more)

### Community 51 - "api/openMayhem.ts"
Cohesion: 0.17
Nodes (14): model, isOpenRouter(), catalogs, Contract, isCompatibleOpenMayhemModel(), isOpenMayhemChatModel(), loadOpenMayhemModels(), OPENMAYHEM_BASE_URL (+6 more)

### Community 52 - "chatJsonl.ts"
Cohesion: 0.15
Nodes (19): buildStChatHeader(), buildStChatMessages(), BuildStChatOptions, chatJsonlFilename(), ChatJsonlInput, ExportableMessage, imageMediaUrl(), isHeaderLine() (+11 more)

### Community 53 - "png.ts"
Cohesion: 0.17
Nodes (14): base64ToUtf8(), crc32(), decodeTextChunk(), getCrcTable(), makeChunk(), PNG_SIGNATURE, PngChunk, readCharacterFromPng() (+6 more)

### Community 54 - "relationshipAssist.ts"
Cohesion: 0.08
Nodes (41): AftercareVerdict, BeliefUpdate, ExpectationUpdate, PlanUpdate, allowedFlagIds(), assessCommitmentAsk(), assessDateOutcome(), assessIntimacyMilestone() (+33 more)

### Community 55 - "make-sprites.mjs"
Cohesion: 0.18
Nodes (20): applyToRp(), buildPositive(), comfyReachable(), downloadImage(), exists(), fillWorkflow(), HERE, keyFor() (+12 more)

### Community 56 - "aftercare.ts"
Cohesion: 0.17
Nodes (17): AFTERCARE_VERDICTS, aftercareDeltas(), aftercareNeed(), AftercarePace, aftercarePaceContext(), aftercareReason(), aftercareToast(), Afterglow (+9 more)

### Community 57 - "activation.ts"
Cohesion: 0.16
Nodes (16): PromptInspector(), LorebookEntry, PromptBuildResult, activateWorldInfo(), ActivationOptions, compositeKey(), describeEntry(), matchesKeywords() (+8 more)

### Community 58 - "detector.ts"
Cohesion: 0.12
Nodes (28): CastCandidatesCard(), CastCandidatesCardProps, dismissKey(), readDismissed(), CAST_MIN_MENTIONS, CAST_PROMPT_LIMIT, CAST_SCAN_TURNS, CastCandidate (+20 more)

### Community 59 - "intimacyCatalog.ts"
Cohesion: 0.13
Nodes (29): allowedIntimacyCategories(), BUILT_IN_ENTRY_KINKS, BUILT_IN_ENTRY_REGIONS, CATEGORY_AROUSAL_WEIGHT, commitmentMet(), composeIntimacyActionText(), DEFAULT_INTIMACY_CATALOG, defaultIntimacyPromptNote() (+21 more)

### Community 60 - "jsonRepair.ts"
Cohesion: 0.31
Nodes (9): closeUnbalanced(), escapeRawNewlinesInStrings(), extractBraces(), insertMissingColons(), insertMissingCommas(), normalizeQuotes(), repairPipeline(), repairUnescapedQuotes() (+1 more)

### Community 61 - "workSchedule.ts"
Cohesion: 0.20
Nodes (18): ScheduleEntry, Weekday, clockBoundaryNote(), describeLateness(), describeShift(), entryLocation(), isWorkSlot(), LATE_GRACE_PHASES (+10 more)

### Community 62 - "devDependencies"
Cohesion: 0.11
Nodes (19): devDependencies, postcss, tailwindcss, @types/express, @types/react, @types/react-dom, typescript, vite (+11 more)

### Community 63 - "avatars.ts"
Cohesion: 0.19
Nodes (18): normalizeCgTrigger(), normalizeGalleryEntries(), AUDIO_EXT_BY_MIME, AvatarEntityKind, AvatarMapSubKind, decodeAudioDataUrl(), decodeImageDataUrl(), entityDir() (+10 more)

### Community 64 - "estimateTokens"
Cohesion: 0.16
Nodes (11): fixedFieldHint(), ASSISTANT_SYSTEM_PROMPT, AssistantPromptInput, assistantStopSequences(), AssistantTurn, buildAssistantPrompt(), renderTurn(), template (+3 more)

### Community 65 - "CharacterEditor"
Cohesion: 0.21
Nodes (16): CharacterEditor(), kinksAt(), regionsAt(), RelationshipStarter, SocialConnection, fileToDataUrl(), buildCharacterPack(), characterPackFilename() (+8 more)

### Community 66 - "dependencies"
Cohesion: 0.12
Nodes (17): @agnai/sentencepiece-js, express, @fontsource-variable/inter, @fontsource/zen-maru-gothic, lucide-react, dependencies, @agnai/sentencepiece-js, express (+9 more)

### Community 67 - "SettingsView.tsx"
Cohesion: 0.19
Nodes (11): SettingsView(), Tab, EN, current, getLocale(), LANGUAGES, Locale, LocaleId (+3 more)

### Community 68 - "useChatSession"
Cohesion: 0.14
Nodes (24): makeGenKey(), stanceOfScene(), downscaleImageToBase64(), effectiveAssistFlag(), hasRequiredFlags(), latestImages(), sanitizeSceneTag(), useChatSession() (+16 more)

### Community 69 - "ChatWindow.tsx"
Cohesion: 0.11
Nodes (26): AssistActivityBar(), AuthorNotePanel(), CalendarPanel(), ChatToolbar(), ChatToolbarAction, ChatWindow(), CHIP_CLASSES, QuickReplyBar() (+18 more)

### Community 70 - "calendar.test.ts"
Cohesion: 0.27
Nodes (18): DayPlannerPanel(), WorldEditor(), activityPhase(), advancePhase(), cycleIndex(), describeVitality(), describeWeather(), describeWorldMoment() (+10 more)

### Community 71 - "lib.mjs"
Cohesion: 0.20
Nodes (12): bold, dim, fail(), green, MIN_NODE, nodeIsSupported(), npmRun(), red (+4 more)

### Community 72 - "builder.ts"
Cohesion: 0.20
Nodes (14): MacroContext, substituteMacros(), buildObjectiveBlock(), buildPrompt(), DEFAULT_PROMPT_SECTIONS, fillTemplate(), findLastIndex(), PROMPT_SECTION_LABELS (+6 more)

### Community 73 - "outreach.ts"
Cohesion: 0.24
Nodes (8): BASE_CHANCE, generateOutreachMessage(), OutreachCheck, OutreachReason, outreachReasonHint(), SILENCE_THRESHOLD_HOURS, truncateAtStrayTurnMarker(), describePresence()

### Community 74 - "participantArchetype.ts"
Cohesion: 0.23
Nodes (14): ARCHETYPE_KEYWORDS, ARCHETYPE_LINES, archetypeGuidance(), ArchetypeMatch, classifyArchetype(), findArchetypeMatch(), NamedConnectionLike, ParticipantGuidanceParams (+6 more)

### Community 75 - "momentum.ts"
Cohesion: 0.22
Nodes (13): asymmetricPacingNote(), describeInitiativeBalance(), describeMomentum(), HIGH_RESISTANCE_MOODS, INITIATIVE_CLAMP, initiativeContribution(), MOMENTUM_DECAY, nextInitiativeBalance() (+5 more)

### Community 76 - "What's in it"
Cohesion: 0.14
Nodes (14): Characters, Chat, Dates, scenes and intimacy, Image generation, Model backends, Money, gifts and gallery, OpenMayhem, Relationships (+6 more)

### Community 77 - "immersionPreset.ts"
Cohesion: 0.30
Nodes (11): GenerationParams, BUILTIN_PRESETS, SamplerPreset, findOrThrow(), MAXIMUM_IMMERSION_SAMPLER_PRESET_ID, MAXIMUM_IMMERSION_SYSTEM_PROMPT_ID, MAXIMUM_IMMERSION_WORLD_TEMPLATE_ID, MaximumImmersionBundleItem (+3 more)

### Community 78 - "InstructTemplateSection.tsx"
Cohesion: 0.35
Nodes (9): EditableFields, fieldsOf(), InstructTemplateSection(), SystemPromptSection(), FileButton(), parseSillyTavernPreset(), DEFAULT_SYSTEM_PROMPT, toastInfo() (+1 more)

### Community 79 - "boundaryGuard.ts"
Cohesion: 0.29
Nodes (10): detectPersonaAgencyViolation(), subjectVerbPattern(), boundaryPhraseCrossed(), detectAnyBoundaryCrossing(), detectBoundaryCrossing(), LIMIT_MARKERS, personaBoundaryPhrases(), significantWords() (+2 more)

### Community 80 - "plans.ts"
Cohesion: 0.20
Nodes (11): applyPlanUpdates(), MAX_ACTIVE_PLANS, parsePlanUpdates(), PLAN_KINDS, PLAN_STALE_TURNS, PlanKind, planLine(), planLinesForJudge() (+3 more)

### Community 81 - "P2-6 动态客串 NPC —— 设计书（先设计，后落刀）"
Cohesion: 0.15
Nodes (12): 3.1 新模块（纯函数，可单测）, 3.2 候选怎么存（**不新增持久化状态**）, 3.3 "扶正"（唯一的写路径）, 3.4 开关（可关）, 3.5 提示词侧（可选、有上限）, P2-6 动态客串 NPC —— 设计书（先设计，后落刀）, 一、先说雷区（为什么这条不能照抄群聊那套）, 三、设计 (+4 more)

### Community 82 - "sceneTag.ts"
Cohesion: 0.36
Nodes (5): countStaticSceneTurns(), sceneProgressionNudge(), buildSceneInstruction(), extractSceneTag(), stripSceneTagForDisplay()

### Community 83 - "beliefs.ts"
Cohesion: 0.26
Nodes (8): applyBeliefUpdates(), BELIEF_STALE_TURNS, beliefLinesForJudge(), beliefsChanged(), beliefsGuidance(), MAX_ACTIVE_BELIEFS, parseBeliefUpdates(), CharacterBelief

### Community 84 - "expectations.ts"
Cohesion: 0.24
Nodes (9): applyExpectationUpdates(), EXPECTATION_STALE_TURNS, expectationLinesForJudge(), expectationsChanged(), expectationsGuidance(), MAX_ACTIVE_EXPECTATIONS, parseExpectationUpdates(), violatedExpectationTexts() (+1 more)

### Community 85 - "messageSegments.ts"
Cohesion: 0.11
Nodes (28): MessageBubbleProps, MessageLog(), avatarHtml(), buildChatTranscriptHtml(), escapeHtml(), messageTextHtml(), RenderContext, BUILTIN_SET (+20 more)

### Community 86 - "compilerOptions"
Cohesion: 0.17
Nodes (11): vite.config.ts, vitest.config.ts, compilerOptions, allowSyntheticDefaultImports, module, moduleResolution, noEmit, skipLibCheck (+3 more)

### Community 87 - "summarize.ts"
Cohesion: 0.24
Nodes (8): VoiceFingerprint, SummarizeInput, summarizeMessages(), SUMMARY_MAX_LENGTH, SummaryDetail, MESSAGES, TestInput, voiceRetentionInstruction()

### Community 88 - "make-backgrounds.mjs"
Cohesion: 0.30
Nodes (11): comfyReachable(), downloadImage(), fillDay(), fillNight(), HERE, main(), parseArgs(), queuePrompt() (+3 more)

### Community 89 - "FP 吸收计划与项目状态（中文版工作文档）"
Cohesion: 0.18
Nodes (11): FP 吸收计划与项目状态（中文版工作文档）, 一、部署与运维速查, 七、上游同步注意, 三、FP 机制吸收进度, 二、已完成改造（相对上游）, 五、第三期吸收审计（2026-09-13，FP 用户手册/发布日志/剩余源码深挖）, 八、文档纪律（2026-09-13 起）, 六、下一步计划（按序） (+3 more)

### Community 90 - "originCheck.ts"
Cohesion: 0.29
Nodes (6): openMayhemRouter(), extraAllowedOrigins(), headerValue(), LOOPBACK_HOSTS, originAllowed(), originGuard()

### Community 91 - "worldTemplates.ts"
Cohesion: 0.35
Nodes (9): blankWorld(), assistOverridesForTemplate(), getWorldTemplate(), HIDDEN_TABS, hiddenWorldTabs(), normalizeWorldTemplateId(), RETIRED_TEMPLATE_ALIASES, WORLD_TEMPLATES (+1 more)

### Community 92 - "sillyTavernPreset.ts"
Cohesion: 0.22
Nodes (8): convertInstruct(), isForceNames(), Obj, ParsedSillyTavernPreset, CHATML, CHATML_NAMES, GEMMA, toAppMacros()

### Community 93 - "ttsProviders.ts"
Cohesion: 0.29
Nodes (7): escapeSsml(), listKoboldSpeakers(), speakAzure(), speakElevenLabs(), speakOpenAiCompatible(), synthesizeSpeech(), TtsConfig

### Community 94 - "RP Suite — TODO"
Cohesion: 0.18
Nodes (10): 3a. One "play style" concept, everywhere, 3b. A game loop — the biggest differentiator vs. SillyTavern, RP Suite — TODO, Start here, Tier 1 — Make VN mode actually feel like a visual novel, Tier 2 — Onboarding & the "which mode am I in" thread, Tier 3 — Unify "play style", and give the dating sim a game loop, Tier 4 — Competitive parity & authoring (+2 more)

### Community 95 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, dev, dev:client, dev:server, preview, start, test (+2 more)

### Community 96 - "RP Suite / koibito-ai — 项目现状"
Cohesion: 0.20
Nodes (9): 1. 项目定位, 2. 技术栈（实测，含版本）, 3. 规模基线（2026-09-13 实测，供后续对比）, 4. 模块地图（**真实路径**，改动前先按此定位）, 5. 相对上游的已完成改造, 6. 已知缺陷（未修，登记在案）, 7. 文档地图（哪份管什么）, 8. 快速开始 (+1 more)

### Community 97 - "placeholder.ts"
Cohesion: 0.27
Nodes (8): cells, BACKGROUND_PALETTE, NEUTRAL, paletteFor(), PALETTES, placeholderGradient, sceneGradient(), ScenePalette

### Community 98 - "generateFullCharacter.ts"
Cohesion: 0.13
Nodes (21): GeneratedCharacter, generatedToCharacterInput(), card, CHAPTER_PARAMS, DEFAULT_CHAPTER_COUNT, OUTLINE_PARAMS, storySoFar(), writeChapter() (+13 more)

### Community 99 - "importExport.ts"
Cohesion: 0.56
Nodes (9): wrapCardV2(), withGrowth(), blankAvatarBlob(), downloadJson(), downloadJsonWithGrowth(), downloadPng(), downloadPngWithGrowth(), sanitizeFilename() (+1 more)

### Community 100 - "llmProxy.ts"
Cohesion: 0.22
Nodes (7): AppConfig, authGuard(), cfg, CONFIG_PATH, llmProxy, loginHandler(), sessionToken

### Community 101 - "novelaiTokenizer.ts"
Cohesion: 0.31
Nodes (7): __dirname, encodeTokens(), getProcessor(), MODEL_FILES, NovelAITokenizerId, processors, tokenizerForModel()

### Community 102 - "cgTrigger.ts"
Cohesion: 0.31
Nodes (7): GrowthSnapshot, IntimacyPhase, RelationshipStage, CgTriggerContext, galleryUnlocked(), triggeredCg(), triggerFires()

### Community 103 - "touch.ts"
Cohesion: 0.40
Nodes (8): DEFAULT_REGION_SENSITIVITY, RegionSensitivity, isRegionAvailable(), newlyDiscoveredRegions(), sensitivityFor(), TouchProfile, unavailableRegions(), withDiscoveredRegions()

### Community 104 - "multiParticipantScene.test.ts"
Cohesion: 0.13
Nodes (14): emptyArousalState(), ClothingRemoval, ctx, Run, arousalOf(), IntimacyTurnObservation, sceneArousalFloorValue(), sceneResolveSnapshot() (+6 more)

### Community 105 - "rebuff.ts"
Cohesion: 0.33
Nodes (8): isRebuffActive(), REBUFF_WINDOW_TURNS, rebuffGuidance(), RebuffKind, RecentRebuff, backfire, deflect, turnsSinceRebuff()

### Community 106 - "rapport.ts"
Cohesion: 0.31
Nodes (7): assessRapport(), isRapportTrajectory(), RAPPORT_PARAMS, RAPPORT_READS, RAPPORT_TRAJECTORIES, RapportSpec, TRANSCRIPT

### Community 107 - "rp asset generation — ComfyUI + Anima"
Cohesion: 0.22
Nodes (8): Add a character, Backgrounds (day/night location art), Comfy MCP (agent tools), How it works, Options, Push onto the character (`--apply`), rp asset generation — ComfyUI + Anima, Watch it in ComfyUI

### Community 108 - "OpenMayhem integration"
Cohesion: 0.25
Nodes (8): Follow-up recommendation for OpenMayhem, Images and speech, Implementation boundaries, Interactive roleplay check, OpenMayhem integration, Recommended first release, Research findings (September 9, 2026), Validation

### Community 109 - "builder.test.ts"
Cohesion: 0.25
Nodes (7): PromptBuildInput, StyleGuidanceItem, baseInput(), character(), template, getInstructTemplate(), WorldInfoRuntimeState

### Community 110 - "dayPlanner.ts"
Cohesion: 0.36
Nodes (5): buildDayPlannerActivities(), dateEventCardForActivity(), PlannerCharacter, PlannerWorld, resolveMeetLocation()

### Community 111 - "vnProse.ts"
Cohesion: 0.64
Nodes (6): vnDialogueBalanceGuidance(), vnExpressionGuidance(), vnInteriorityGuidance(), vnProseGuidance(), vnProseNote(), vnSoundGuidance()

### Community 112 - "RP Suite"
Cohesion: 0.29
Nodes (7): Credits, Docker, License, Notes, RP Suite, Screenshots, Setup

### Community 113 - "coinMutex.ts"
Cohesion: 0.43
Nodes (4): CoinMutex, createCoinMutex(), getCoinMutex(), mutexesByChatId

### Community 114 - "count_chaos_pool.py"
Cohesion: 0.43
Nodes (6): load_entries(), main(), normalize(), 去掉行注释，免得注释里出现的示例条目被算进池子。, 归一化用于查重：去占位差异、去空白与标点、全角转半角。, strip_comments()

### Community 115 - "Running RP Suite in Docker"
Cohesion: 0.33
Nodes (6): Data, Environment variables, Notes, Quick start, Reaching a model backend, Running RP Suite in Docker

### Community 116 - "package.json"
Cohesion: 0.33
Nodes (5): description, name, private, type, version

### Community 117 - "ColorField.tsx"
Cohesion: 0.60
Nodes (4): ColorField(), ColorFieldProps, hexToTriplet(), tripletToHex()

### Community 120 - "article.ts"
Cohesion: 0.60
Nodes (4): DETERMINERS, indefiniteArticleFor(), looksPlural(), withIndefiniteArticle()

### Community 121 - "regexSafety.ts"
Cohesion: 0.67
Nodes (4): anyKeyIsRisky(), extractSlashRegexPattern(), isRiskyRegexPattern(), MAX_REGEX_HAYSTACK_LENGTH

### Community 122 - "tools/audit — 文档 × 代码对账工具"
Cohesion: 0.33
Nodes (5): tools/audit — 文档 × 代码对账工具, 敏感值清单（本地私有，不入库）, 用法, 维护约定, 退出码约定

### Community 123 - "api/types.ts"
Cohesion: 0.18
Nodes (10): chatCompletionSamplerToRequest(), BASE_REQUEST, jsonResponse(), maxTokensRejection(), ChatCompletionMessage, ChatCompletionSamplerParams, DEFAULT_CHAT_COMPLETION_SAMPLER, GenerateResponse (+2 more)

### Community 124 - "tokenCache.ts"
Cohesion: 0.47
Nodes (4): counts, countTokensCached(), inflight, tokenCacheSize()

### Community 125 - "audio/sfx.ts"
Cohesion: 0.80
Nodes (4): getContext(), playNotificationChime(), playSendBlip(), tone()

### Community 127 - "sceneContinuity.ts"
Cohesion: 0.60
Nodes (3): SceneContinuityFacts, sceneContinuityNote(), trimTrailingPunct()

### Community 128 - "check_pre_commit.py"
Cohesion: 0.60
Nodes (4): changed_files(), local_literals(), main(), 已修改 + 已暂存 + 未跟踪（排除 gitignore）。

### Community 129 - "count_scale.py"
Cohesion: 0.70
Nodes (4): chaos_events(), count_lines(), main(), ts_files()

### Community 133 - "check_gaps.py"
Cohesion: 0.83
Nodes (3): event_count(), files(), main()

## Knowledge Gaps
- **631 isolated node(s):** `name`, `private`, `version`, `type`, `description` (+626 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Character` connect `lib/types.ts` to `useChatSession.ts`, `VNStage.tsx`, `RelationshipPanel.tsx`, `useSettingsStore`, `ambientEvents.ts`, `CharacterEditor.tsx`, `createChat.ts`, `cardSpec.ts`, `ChatMessage`, `seedContent.ts`, `voice.ts`, `epub.ts`, `SamplingControls.tsx`, `toastError`, `relationshipAssist.ts`, `intimacyCatalog.ts`, `workSchedule.ts`, `CharacterEditor`, `outreach.ts`, `messageSegments.ts`, `generateFullCharacter.ts`, `touch.ts`, `dayPlanner.ts`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `useChatSession()` connect `useChatSession` to `useChatSession.ts`, `calendar.ts`, `RelationshipPanel.tsx`, `useSettingsStore`, `slop.ts`, `WelcomeView.tsx`, `slashCommands.ts`, `ambientEvents.ts`, `outfits.ts`, `CharacterEditor.tsx`, `intimacyStages.ts`, `IntimacyScene`, `createChat.ts`, `intimacyScene.ts`, `cardSpec.ts`, `sceneVision.ts`, `continuityGuard.ts`, `aiAssist.ts`, `gifts.ts`, `scenarios.ts`, `ChatMessage`, `lib/types.ts`, `voice.ts`, `sceneParticipants.ts`, `triggers.ts`, `BagPanel.tsx`, `arousal.ts`, `toastError`, `relationshipAssist.ts`, `aftercare.ts`, `detector.ts`, `intimacyCatalog.ts`, `workSchedule.ts`, `estimateTokens`, `ChatWindow.tsx`, `calendar.test.ts`, `builder.ts`, `outreach.ts`, `participantArchetype.ts`, `momentum.ts`, `InstructTemplateSection.tsx`, `boundaryGuard.ts`, `plans.ts`, `sceneTag.ts`, `beliefs.ts`, `expectations.ts`, `messageSegments.ts`, `summarize.ts`, `touch.ts`, `multiParticipantScene.test.ts`, `rebuff.ts`, `rapport.ts`, `builder.test.ts`, `dayPlanner.ts`, `vnProse.ts`, `coinMutex.ts`, `generationLock.ts`, `article.ts`, `api/types.ts`, `tokenCache.ts`, `audio/sfx.ts`, `buildSteerDirective`, `sceneContinuity.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `useSettingsStore` connect `useSettingsStore` to `useChatSession.ts`, `CharacterEditor`, `VNStage.tsx`, `RelationshipPanel.tsx`, `useChatSession`, `ChatWindow.tsx`, `WelcomeView.tsx`, `GenerateCharacterDialog.tsx`, `SamplingControls.tsx`, `CharacterEditor.tsx`, `InstructTemplateSection.tsx`, `useAssistant.ts`, `toastError`, `messageSegments.ts`, `BgmPlayer.tsx`, `detectBackend.ts`, `useSettingsStore.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _631 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useChatSession.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `calendar.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07196969696969698 - nodes in this community are weakly interconnected._
- **Should `VNStage.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07435897435897436 - nodes in this community are weakly interconnected._