import HM from 'human-readable-numbers'
import React from 'react'
import {
  Highlight,
  HighlightArea,
  HorizontalGridLines,
  LineSeries,
  LineSeriesPoint,
  VerticalGridLines,
  XAxis,
  XYPlot,
  YAxis,
} from 'react-vis'

interface Props {
  data: LineSeriesPoint[]
  container: DOMRect | null
}

export const NoOfTxs = React.memo(({ data, container }: Props) => {
  const [lastDrawLocation, setDrawLocation] = React.useState<HighlightArea | null>(null)
  const primaryColor = '#5CBAB0'

  React.useEffect(() => {
    setDrawLocation(null)
  }, [data])

  if (container === null) {
    return null
  }

  return (
    <XYPlot
      xDomain={lastDrawLocation && [lastDrawLocation.left, lastDrawLocation.right]}
      yDomain={lastDrawLocation && [lastDrawLocation.bottom, lastDrawLocation.top]}
      margin={{ left: 50, right: 10, top: 10, bottom: 40 }}
      height={300}
      width={container.width}
    >
      <HorizontalGridLines />
      <VerticalGridLines />
      <XAxis
        tickTotal={5}
        tickFormat={function tickFormat(d) {
          return new Date(d).toLocaleDateString()
        }}
      />
      <YAxis
        title=""
        tickPadding={10}
        tickFormat={function tickFormat(d) {
          return HM.toHumanString(d)
        }}
      />

      <LineSeries color={primaryColor} data={data} />
      <Highlight
        onBrushEnd={(area) => setDrawLocation(area)}
        onDrag={(area) => {
          area &&
            setDrawLocation({
              bottom: (lastDrawLocation?.bottom! | 0) + (area.top! - area.bottom!),
              left: lastDrawLocation?.left! - (area.right! - area.left!),
              right: lastDrawLocation?.right! - (area.right! - area.left!),
              top: lastDrawLocation?.top! + (area.top! - area.bottom!),
            })
        }}
      />
    </XYPlot>
  )
})
