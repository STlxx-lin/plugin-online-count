import React, { useState, useMemo } from 'react';
import { Card, Radio, Empty, Spin } from 'antd';

interface TrendProps {
  times: string[];
  total: number[];
  users: number[];
  guests?: number[];
  loading?: boolean;
  onRangeChange?: (range: 'today' | '7days') => void;
}

export const OnlineTrendChart: React.FC<TrendProps> = ({
  times = [],
  total = [],
  users = [],
  loading = false,
  onRangeChange,
}) => {
  const [range, setRange] = useState<'today' | '7days'>('today');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const handleRange = (e: any) => {
    const val = e.target.value;
    setRange(val);
    onRangeChange?.(val);
  };

  const chartData = useMemo(() => {
    if (!times.length || !total.length) return null;

    const maxVal = Math.max(...total, 5);
    const minVal = 0;
    const width = 800;
    const height = 220;
    const padding = { top: 20, right: 30, bottom: 30, left: 40 };

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const pointsTotal: { x: number; y: number; val: number; time: string }[] = [];
    const pointsUsers: { x: number; y: number; val: number; time: string }[] = [];

    const count = times.length;
    const stepX = count > 1 ? plotWidth / (count - 1) : plotWidth / 2;

    for (let i = 0; i < count; i++) {
      const x = padding.left + (count > 1 ? i * stepX : plotWidth / 2);
      const yTotal = padding.top + plotHeight - ((total[i] - minVal) / (maxVal - minVal || 1)) * plotHeight;
      const yUsers = padding.top + plotHeight - ((users[i] - minVal) / (maxVal - minVal || 1)) * plotHeight;

      pointsTotal.push({ x, y: yTotal, val: total[i], time: times[i] });
      pointsUsers.push({ x, y: yUsers, val: users[i], time: times[i] });
    }

    const totalPath = pointsTotal.reduce(
      (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
      ''
    );

    const totalAreaPath =
      pointsTotal.length > 0
        ? `${totalPath} L ${pointsTotal[pointsTotal.length - 1].x} ${padding.top + plotHeight} L ${pointsTotal[0].x} ${padding.top + plotHeight} Z`
        : '';

    const usersPath = pointsUsers.reduce(
      (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
      ''
    );

    return {
      width,
      height,
      padding,
      plotWidth,
      plotHeight,
      maxVal,
      pointsTotal,
      pointsUsers,
      totalPath,
      totalAreaPath,
      usersPath,
    };
  }, [times, total, users]);

  return (
    <Card
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>📈 在线人数走势与并发分析</span>
          <Radio.Group size="small" value={range} onChange={handleRange} buttonStyle="solid">
            <Radio.Button value="today">今日 24 小时</Radio.Button>
            <Radio.Button value="7days">近 7 天</Radio.Button>
          </Radio.Group>
        </div>
      }
      size="small"
      style={{ borderRadius: 8, marginTop: 16 }}
    >
      <Spin spinning={loading}>
        {chartData ? (
          <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
            <svg
              viewBox={`0 0 ${chartData.width} ${chartData.height}`}
              style={{ width: '100%', height: 220, display: 'block' }}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <defs>
                <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1677ff" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#1677ff" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* 网格线与 Y 轴刻度 */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = chartData.padding.top + chartData.plotHeight * (1 - ratio);
                const val = Math.round(chartData.maxVal * ratio);
                return (
                  <g key={idx}>
                    <line
                      x1={chartData.padding.left}
                      y1={y}
                      x2={chartData.width - chartData.padding.right}
                      y2={y}
                      stroke="#f0f0f0"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={chartData.padding.left - 8}
                      y={y + 4}
                      fill="#8c8c8c"
                      fontSize="10"
                      textAnchor="end"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* X 轴时间刻度标签 (按步长精简展示) */}
              {chartData.pointsTotal.map((p, i) => {
                const step = Math.max(1, Math.floor(chartData.pointsTotal.length / 8));
                if (i % step !== 0 && i !== chartData.pointsTotal.length - 1) return null;
                return (
                  <text
                    key={i}
                    x={p.x}
                    y={chartData.height - 8}
                    fill="#8c8c8c"
                    fontSize="10"
                    textAnchor="middle"
                  >
                    {p.time}
                  </text>
                );
              })}

              {/* 渐变填充区域 */}
              <path d={chartData.totalAreaPath} fill="url(#totalGradient)" />

              {/* 总在线折线 */}
              <path d={chartData.totalPath} fill="none" stroke="#1677ff" strokeWidth="2.5" strokeLinecap="round" />

              {/* 登录用户折线 */}
              <path d={chartData.usersPath} fill="none" stroke="#52c41a" strokeWidth="2" strokeDasharray="4 2" />

              {/* 数据点与 Hover 触发区 */}
              {chartData.pointsTotal.map((p, i) => (
                <g key={i} onMouseEnter={() => setHoverIndex(i)} style={{ cursor: 'pointer' }}>
                  <rect
                    x={p.x - 10}
                    y={chartData.padding.top}
                    width={20}
                    height={chartData.plotHeight}
                    fill="transparent"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={hoverIndex === i ? 5 : 2.5}
                    fill="#1677ff"
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                </g>
              ))}

              {/* 激活指示线 */}
              {hoverIndex !== null && chartData.pointsTotal[hoverIndex] && (
                <line
                  x1={chartData.pointsTotal[hoverIndex].x}
                  y1={chartData.padding.top}
                  x2={chartData.pointsTotal[hoverIndex].x}
                  y2={chartData.padding.top + chartData.plotHeight}
                  stroke="#1677ff"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
              )}
            </svg>

            {/* Hover Tooltip 浮窗 */}
            {hoverIndex !== null && chartData.pointsTotal[hoverIndex] && (
              <div
                style={{
                  position: 'absolute',
                  left: `${(chartData.pointsTotal[hoverIndex].x / chartData.width) * 100}%`,
                  top: 20,
                  transform: 'translateX(-50%)',
                  background: 'rgba(0, 0, 0, 0.82)',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 10,
                }}
              >
                <div style={{ fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 3, marginBottom: 4 }}>
                  🕒 {chartData.pointsTotal[hoverIndex].time}
                </div>
                <div style={{ color: '#69b1ff' }}>
                  ● 总在线人数: <strong>{chartData.pointsTotal[hoverIndex].val}</strong>
                </div>
                <div style={{ color: '#95de64' }}>
                  ● 已登录用户: <strong>{chartData.pointsUsers[hoverIndex].val}</strong>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史在线时序数据（系统每 5 分钟自动采样）" />
        )}
      </Spin>
    </Card>
  );
};
