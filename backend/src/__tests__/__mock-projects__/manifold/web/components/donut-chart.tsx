import React from 'react'

interface Segment {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  segments: Segment[]
  total: number
}

const DonutChart: React.FC<DonutChartProps> = ({ segments, total }) => {
  const radius = 15
  const circumference = 2 * Math.PI * radius

  let accumulatedOffset = 0

  return (
    <div className="flex items-center justify-center">
      {/* Donut Chart Container */}
      <div className="relative">
        <svg
          width="200"
          height="200"
          viewBox="0 0 40 40"
          className="-rotate-90 transform"
        >
          {segments.map((segment, index) => {
            const strokeDasharray = `${
              (segment.value / total) * circumference
            } ${circumference}`
            const strokeDashoffset = -accumulatedOffset
            accumulatedOffset += (segment.value / total) * circumference

            return (
              <circle
                key={index}
                cx="20"
                cy="20"
                r={radius}
                fill="transparent"
                stroke={segment.color}
                strokeWidth="5"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-300 ease-out"
              />
            )
          })}
        </svg>
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center">
          <div className="text-xl">
            <b>{`$${total.toFixed(2)}`}</b>
          </div>
          <div className="text-sm">Total</div>
        </div>
      </div>

      {/* Labels Container */}
      <div className="ml-4 flex flex-col space-y-2">
        {segments.map((segment, index) => (
          <div key={index} className="flex items-center space-x-2">
            <span
              className="h-3 w-3"
              style={{ backgroundColor: segment.color }}
            ></span>
            <span>
              {segment.label}: ${segment.value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DonutChart
