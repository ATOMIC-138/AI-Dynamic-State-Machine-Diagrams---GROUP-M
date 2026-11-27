import type { LayoutComparison, LayoutMetrics } from '../types/graph';

export interface MetricsPanelProps {
  current: LayoutMetrics | null;
  comparison: LayoutComparison | null;
  isStub: boolean;
}

const ROWS: { key: keyof LayoutMetrics; label: string }[] = [
  { key: 'edgeCrossings', label: '邊交叉數' },
  { key: 'nodeOverlaps', label: '節點重疊數' },
  { key: 'totalEdgeLength', label: '總邊長' },
  { key: 'totalBends', label: '轉折點數' },
];

function reductionSummary({ crossingReductionCount: count, crossingReductionPercent: percent }: LayoutComparison) {
  const direction = count < 0 ? '增加' : '減少';
  return `交叉${direction} ${Math.abs(count)}（${Math.abs(percent).toFixed(1)}%）`;
}

export function MetricsPanel({ current, comparison, isStub }: MetricsPanelProps) {
  return (
    <aside className="metrics-panel" aria-label="排版數據">
      <h2>目前圖形</h2>
      {current ? (
        <table>
          <tbody>
            {ROWS.map(({ key, label }) => (
              <tr key={key}>
                <th scope="row">{label}</th>
                <td data-metric={key}>{Math.round(current[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="hint">尚未載入圖形。</p>
      )}

      <h2>Baseline vs. Sugiyama Optimized</h2>
      {comparison ? (
        <>
          <table>
            <thead>
              <tr>
                <th />
                <th scope="col">Baseline</th>
                <th scope="col">Optimized</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(({ key, label }) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>{Math.round(comparison.baseline[key])}</td>
                  <td>{Math.round(comparison.optimized[key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="reduction">{reductionSummary(comparison)}</p>
          <p className="hint">這是排版當下的比較，之後的手動調整不計入。</p>
        </>
      ) : (
        <p className="hint">載入範例、匯入外部 JSON 或按 Auto Layout 後顯示。載入儲存檔不會執行排版。</p>
      )}

      {isStub && <p className="stub-note">目前使用假實作（src/editor/stubs.ts），排版與數字只供介面開發。</p>}
    </aside>
  );
}
