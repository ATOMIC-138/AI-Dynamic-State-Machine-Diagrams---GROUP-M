# Group Final Report

## Assignment
# State Machine Diagram Layout Editor — Group M Assignment

## 專題核心目標
設計並實作一套 **狀態機圖自動排版與互動式編輯系統（Layout Engine + Interactive Layout Editor）**，聚焦於三大核心問題：
1. **智慧自動排版（第一優先）**：接收外部狀態機圖結構（Nodes、Edges、Regions、Hierarchy），以 Sugiyama 分層式演算法為核心，處理循環與回頭邊、降低邊交叉數、避免節點重疊、支援巢狀區域遞迴排版，並提供量化數據驗證改善幅度。
2. **互動式圖形編輯與階層區域**：區分 `Underlying Graph` 與 `Visible Graph`。支援節點拖曳（不觸發全圖重排）、箭頭控制點與轉折點調整（不改變語意起訖）、新增節點與連線，以及階層區域右鍵 **Collapse / Expand**（收合為圓形節點且**完全不移動外部節點**；展開時完整還原內部座標與手動轉折點）。
3. **儲存及還原（Save / Load）**：以 JSON 完整保存結構、座標、尺寸、手動 waypoints、區域階層與收合狀態、使用者新增元素；**重新載入時直接還原，不可自動重新排版**（另提供手動 Auto Layout / Reset Layout 按鈕）。

## 系統邊界（不需負責）
- 不負責 Process Algebra Parser、執行語意、ITG 語意產生。
- 不負責精美 UML 狀態特殊圖示、狀態名稱美術排版或箭頭條件標籤美術。

## 三人協作分工（33% / 33% / 33%，選手與裁判分離）
| 成員 | 身分 | 專屬目錄 / 檔案 | 核心職責 | Topic |
| :--- | :--- | :--- | :--- | :--- |
| **P01 Arthur** | Member A | `src/types/`, `src/model/`, `src/metrics/`, `fixtures/`, `tests/model/`, `tests/metrics/`, `scripts/`, `.group/` | Graph Model、Underlying/Visible 投影、JSON Save/Load、客觀評估指標 (`metrics.ts`)、高難度測試圖集 (`fixtures/`)、`groupctl` 初始化與 `INT` 整合驗收 | `model-metrics` |
| **P02 Bin** | Member B | `src/layout/`, `tests/layout/` | Sugiyama 分層引擎、循環與回頭邊處理、Crossing Reduction + 局部最佳化、座標分配、Edge Routing、巢狀 Region 遞迴排版 | `layout-engine` |
| **P03 Itaer** | Member C | `src/editor/`, `src/ui/`, `src/App.tsx`, `tests/editor/` | 互動式 SVG 畫布、節點與轉折點拖曳、新增節點與連線、右鍵 Collapse/Expand、工具列與 Metrics 數據對比面板 | `interactive-editor` |

## 最終驗收清單（14 項）
1. 能接收其他組別提供的節點、連線及階層區域資料。
2. 第一次開啟時能自動產生合理的初始排版。
3. 能透過演算法有效降低邊交叉，並有測試數據支持。
4. 能處理循環、分支及多重連線。
5. 節點可以自由拖曳，位置不會無故被其他操作改變。
6. 箭頭可以手動調整路徑及轉折點。
7. 可以新增節點及連線。
8. 區域以虛線框顯示。
9. 可以將區域收合成一般大小的圓形節點。
10. 收合時外部節點位置不變，連線自動調整。
11. 重新展開時能恢復原本的內部排版。
12. 支援巢狀階層區域。
13. 可以儲存整張圖的結構與排版資料。
14. 重新開啟時完整還原，不會自動重新排版。


## Result
GROUP-M completed and integrated the State Machine Diagram Layout Editor across Member A (P01 Arthur: Graph Model, Underlying/Visible hierarchical projection, JSON Save/Load, independent Metrics evaluator, 4 benchmark fixtures), Member B (P02 Bin: hierarchical Sugiyama layout engine with cycle/feedback handling, crossing reduction, and recursive nested region layout), and Member C (P03 Itaer: interactive SVG canvas, node/waypoint editing, add state/transition, nested region collapse/expand, Toolbar, and Metrics comparison panel). All 14 acceptance criteria in assignment.md are met; isolated automated checks pass (tsc --noEmit, 84/84 Vitest tests across 10 test files, vite build); Baseline vs. Sugiyama Optimized benchmarks achieve 96.8% crossing reduction on high-crossing (31->1), 62.5% on cycles-feedback (8->3), 50.0% on nested-regions (4->2), and 0 node overlaps across all fixtures.

## Canonical Commit
886ab30baa03303a4e42f5dd710cae3f29e3f9d8

## Important Changes
- C-P01-9833a373ea: Implement Member A core modules: Graph Model CRUD, Underlying/Visible hierarchical projection, JSON Import/Save/Load, independent Layout Metrics evaluator, 4 benchmark fixtures, and 20 unit tests (P01)
- C-P03-2c4358e8f8: 完成 Member C 互動編輯器與 UI（SVG 畫布、拖曳與轉折點編輯、新增節點與連線、收合展開、存讀檔、工具列與數據面板） (P03)
- C-P02-b2157f3a70: 完成 Member B 狀態機圖自動排版引擎與測試 (P02)
- C-P01-4facd5969e: Fix all 3 Member C review findings: reject node/region ID collisions across import/load/addNode, expand enclosing parent regions when dragging collapsed region circles, and count crossings on interior waypoints and collinear overlaps (high-crossing baseline now accurately reports 31 vs 1 optimized) (P01)
- C-P01-8bfd0f8519: Address remaining P03 review item 4 & docs: validate unknown/duplicate/conflicting regions.children IDs, report node/region ID collision before cycle check, and document moveNode collapsed-region support & nodeOverlaps scope (P01)
- C-P01-921b226420: Fix P02 review regression: use strict perpendicular-distance collinearity (<= EPS) instead of bend-angle threshold when simplifying polylines for crossing calculation, and retain shallow-angle 2-crossing regression test (P01)
- C-P03-f474d15ee4: 修正 Bin 審查指出的兩點：開檔只採用最近一次的選擇；「符合畫面」納入連線轉折點。附 2 項測試。 (P03)
- C-P02-7a9bcd18b3: 依 P03 審查修正排版路由、交叉計數與收合圓位置 (P02)
- C-P01-93204aab96: Fix collinear overlap overcounting in metrics.ts: group contiguous collinear overlaps into maximal contact intervals [S, E], exclude shared-endpoint branches/merges (0), exclude same-side touches (0), count side-swap once (+1); added unit tests for shared-source branch, same-side touch, and multi-segment swap/non-swap (26/26 tests pass; high-crossing verified 31 vs 1) (P01)
- C-P02-567e86b747: 修正箭頭端點、回頭通道與交叉計數 (P02)
- C-P02-99b9a531df: 依 P03 複查修正端點折返與排版交叉比較 (P02)
- C-P03-fb2f67f0c4: 用匯入按鈕開到本工具存檔時原樣還原、不重新排版；移除剩下的假實作（內建假範例、STUB 標籤與樣式）。附 2 項測試。 (P03)
- C-P01-c2344bbeac: Polish remaining demo & performance issues: refine nested-regions.json for visible crossing reduction (4->2, -50%) and compact aspect ratio (3.25), add O(1) AABB pre-rejection in metrics.ts and defer metrics while dragging for smooth 200-node drag, allow fitViewport down to 0.02 scale for huge graphs, and remove unused isStubBackend flag (84/84 tests pass) (P01)

## Validation
Automated checks passed. Evidence: E-20261127T071006Z-P01-95ec70cf22.
- ["C:\\Users\\user\\AppData\\Local\\pipx\\pipx\\venvs\\groupctl\\Scripts\\python.exe", "scripts/run_checks.py"]
- Review E-20261126T140701Z-P01-dfb901c1f3: accept — Reviewed Member B layout engine (cycleRemoval, sugiyama, edgeRouting, hierarchicalLayout, index). API matches plan section 4 contract cleanly with zero file overlap.
- Review E-20261126T140717Z-P01-dd18576846: accept — Reviewed Member C interactive editor and UI (App, DiagramCanvas, backend, presets, session, interaction). Clean separation via backend.ts and auto-discovery of fixtures/*.json; zero file overlap.
- Review E-20261126T141730Z-P03-e63a1790ec: accept_with_changes — A 的模型與評分模組符合計畫第 4 節的匯出介面，只修改自己的目錄，沒有動共用契約；typecheck、20 項測試、build 在此 commit 通過，收合／展開（含巢狀）與存讀檔正常。有 3 項建議在最終 Demo 前修正（issues 1–3），並為它們補測試。本次審查由 Claude（AI）代 P03 讀 diff 與執行測試。
- Review E-20261126T142601Z-P02-b96e47f170: accept_with_changes — 原有測試驗證了單節點拖曳、存檔載入不重排及區域收合展開。另重現兩項會影響使用者的問題，建議先修正檔案讀取順序和畫面縮放範圍，再進行整合驗收。
- Review E-20261126T142911Z-P03-ec6732214a: accept_with_changes — B 的排版引擎基礎扎實：匯出介面符合計畫第 4 節，只改自己的目錄；typecheck、7 項測試、build 在此 commit 通過。1500 張隨機圖（巢狀區域、自環、多重邊、LR/TB、不同間距）沒有節點或區域重疊、超出所屬區域、箭頭穿過其他節點，也沒有當掉；4 個 fixtures 的交叉數都沒有變差（high-crossing 31→1）。有 3 項建議在最終 Demo 前修正（issues 1–3），集中在回頭邊與收合後重排，並建議補對應測試。本次審查由 Claude（AI）代 P03 讀 diff 與執行測試。
- Review E-20261126T143334Z-P03-434a26ab29: accept_with_changes — 更正 E-20261126T142911Z-P03-ec6732214a：該版部分交叉數是用 A 的 0be5762 計算，而那版指標會把重合但沒交叉的線段也算進去。本版改掉這些數字，問題與結論不變。B 的排版引擎基礎扎實：匯出介面符合計畫第 4 節，只改自己的目錄；typecheck、7 項測試、build 通過。1500 張隨機圖沒有節點或區域重疊、超出所屬區域、箭頭穿過其他節點，也沒有當掉；4 個 fixtures 最佳化後的交叉數都不比 baseline 多（high-crossing 31→1）。有 3 項建議在最終 Demo 前修正（issues 1–3），並建議補對應測試。本次審查由 Claude（AI）代 P03 讀 diff 與執行測試。
- Review E-20261126T143419Z-P02-f76f7f89af: accept_with_changes — 上次審查的兩個案例已通過複核。另重現一個新的交叉計數退步，建議在整合前修正。
- Review E-20261126T145318Z-P01-4f35126543: accept — Reviewed updated Member B layout engine (4b52d8c). Verified A* obstacle routing, feedback/parallel lane separation, collapsedPosition reset on relayout, and routed-crossing safeguard across all 4 fixtures in LR and TB.
- Review E-20261126T145343Z-P01-c05f9ace9f: accept — Reviewed updated Member C interactive editor (8bef313). Both P02 review issues cleanly resolved: async File.text() race guarded by trackLatestRequest and Fit-to-View now includes drawn edge waypoints via contentBoxes.
- Review E-20261127T045837Z-P02-a60debec3e: accept — 已重跑上一輪的兩個案例。較早開始讀取的檔案不會覆蓋最近選擇的檔案，「符合畫面」也會納入拖到節點範圍外的連線轉折點。接受此修正版。
- Review E-20261127T051950Z-P03-d2a21151ec: accept_with_changes — B 的新版修好了先前回報的問題（E-20261126T150215Z-P03-aa1a2b66c7）：箭頭不再穿回自己的起訖方框，10 條回頭邊的通道間距固定 6px；整條被蓋住的箭頭更少，也沒有一張圖最佳化後比 baseline 差。typecheck、19 項測試、build 通過，1500 張隨機圖沒有重疊、穿越或當掉。但這次修改帶來三個退步（issues 1–3），建議修好再整合；上一版 4b52d8c 在預設大小的圖上沒有折返、交叉也較少。本次審查由 Claude（AI）代 P03 讀 diff 與執行測試。
- Review E-20261127T054950Z-P03-ca9d29b5b9: accept — B 的 bfbddec 修好了先前審查 E-20261127T051950Z-P03-d2a21151ec 的 3 項：平行轉移不再折返，節點位置相同時交叉不再變多，保護條件不再丟掉較好的排版；整體也比上一個穩定版 4b52d8c 好。typecheck、23 項測試、build 通過。接受此版本。本次審查由 Claude（AI）代 P03 讀 diff 與執行測試。
- Review E-20261127T063837Z-P01-331fa9b966: accept — Reviewed P03 saved-file import safeguard and stub cleanup (faa5f38). Cleanly restores saved documents without relayout even via Import External JSON and removes unused stub samples/UI.
- Review E-20261127T064408Z-P02-19785a8ac5: accept — 已驗證從匯入按鈕開啟本工具的存檔會完整還原，不會重新排版；一般外部 JSON 仍會執行正式排版。介面只顯示小組的正式範例。接受此修正版。
- Review E-20261127T070407Z-P03-8972f93b69: accept — 接受。A 的 2ce4e97 解決了 main 測試時提出的 Demo 圖看不到改善、nested 圖字太小、大圖拖曳卡頓與「符合畫面」放不下：nested 主圖現在 4 → 2（減少 50%），圖形由 2104×245 變 1444×445，200 個狀態拖曳明顯順暢且能整張顯示。拖曳期間 Metrics Panel 不更新，放開後才更新（刻意的取捨）。本次修改也動到 C 負責的檔案（App.tsx、editor/backend.ts、editor/geometry.ts、editor/useDiagramInteraction.ts、tests/editor），一併檢查過，有一個不阻擋的縮放問題。本審查由 Claude（AI）代 P03 讀 diff 與執行測試；瀏覽器操作是 AI 模擬，不能代替 FINAL 要求的真人確認。
- Human evidence: Initiating member P01 (Arthur) reported manual testing completed and requested FINAL preparation on 2026-11-27; candidate report and hash are presented directly to the human for explicit confirmation via groupctl final-publish --confirm.

## Known Limitations
Collapsed region proxy circles use a fixed 36px radius, so longer region labels (e.g., Authentication, TaskProcessing) extend slightly beyond the circle outline, and redirected boundary edges temporarily render directly without underlying waypoints until expanded (original waypoints are preserved and restored verbatim on expand).
When Fit-to-View zooms out below 20% on very large graphs (e.g., 200 states at ~14.5%), wheel zoom-in followed by wheel zoom-out stops at the 20% wheel floor and requires clicking Fit-to-View again to return to full-graph scale (non-blocking review note E-20261127T070407Z-P03-8972f93b69).
Per assignment.md scope boundaries, Process Algebra parsing, execution/ITG semantics, and decorative UML styling or on-canvas edge label typography are intentionally out of scope (edge labels remain inspectable via SVG hover tooltips).

## Unincorporated Changes

## Contributors
- P01
- P02
- P03
