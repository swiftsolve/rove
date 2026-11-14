import { cva } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../utils/cn'
import type { VariantOf } from '../../utils/variants'

// The body's padding, by what it holds. Rows that carry their own vertical
// padding stack with none above them, and just enough below to clear a footer
// (CardFooter marks itself `data-card-footer`).
// It grows to fill an openable card, so content can sit at its foot.
const bodyVariants = cva('grow', {
  variants: {
    layout: {
      default: 'px-(--card-body-padding) pt-4 pb-(--card-body-padding)',
      rows: 'flex flex-col px-(--card-body-padding) pb-(--card-body-padding) has-[+[data-card-footer]]:pb-12',
      flush: 'pt-4 pb-(--card-body-padding)',
    },
  },
  defaultVariants: { layout: 'default' },
})

type CardBodyProps = Omit<ComponentProps<'div'>, 'children'> & {
  /**
   * `default` pads all round. `rows` for rows that carry their own vertical
   * padding (settings, list rows): no top padding. `flush` for a
   * DataListStack, whose hairlines run to the card's sides.
   */
  layout?: VariantOf<typeof bodyVariants, 'layout'>
  /** The content. */
  children: ReactNode
}

/** The padded body. A little top padding gives the content more room below the title than above it. */
export function CardBody({ layout = 'default', className, children, ...props }: CardBodyProps) {
  return (
    <div className={cn(bodyVariants({ layout }), className)} {...props}>
      {children}
    </div>
  )
}
