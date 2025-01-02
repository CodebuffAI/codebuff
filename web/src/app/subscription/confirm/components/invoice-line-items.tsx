import { InvoiceLineItem, PlanName } from 'common/src/types/plan'

interface InvoiceLineItemsProps {
  items: InvoiceLineItem[]
  targetPlan: PlanName
}

const formatPeriod = (start: number, end: number) => {
  return `${new Date(start * 1000).toLocaleDateString()} - ${new Date(
    end * 1000
  ).toLocaleDateString()}`
}

const getItemDescription = (item: InvoiceLineItem) => {
  if (item.amount < 0) {
    return 'Credit for unused time on current plan'
  }

  return `Remaining time on new plan`
}

export const InvoiceLineItems = ({
  items,
  targetPlan,
}: InvoiceLineItemsProps) => {
  const charges = items.filter((item) => item.amount >= 0)
  const credits = items.filter((item) => item.amount < 0)

  return (
    <div className="space-y-1 text-sm">
      {/* Charges */}
      {charges.map((item, index) => (
        <div key={index} className="flex justify-between">
          <div>
            <span>{getItemDescription(item)}</span>
            {item.period && (
              <div className="text-xs text-gray-500">
                {formatPeriod(item.period.start, item.period.end)}
              </div>
            )}
          </div>
          <span>${item.amount.toFixed(2)}</span>
        </div>
      ))}

      {/* Credits section */}
      {credits.length > 0 && (
        <>
          {credits.map((item, index) => (
            <div key={index} className="flex justify-between text-green-600">
              <div>
                <span>{getItemDescription(item)}</span>
                {item.period && (
                  <div className="text-xs text-gray-500">
                    {formatPeriod(item.period.start, item.period.end)}
                  </div>
                )}
              </div>
              <span>-${Math.abs(item.amount).toFixed(2)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
