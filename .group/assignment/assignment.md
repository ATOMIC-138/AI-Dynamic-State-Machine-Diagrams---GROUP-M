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
