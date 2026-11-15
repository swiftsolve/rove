import { cva } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../utils/cn'
import type { VariantOf } from '../../utils/variants'

/**
 * The body's padding, by what it holds. The header already leaves the card's
 * padding under its title, so no body pads its top. Rows carry their own
 * vertical padding, so a `rows` body takes it back above and below: the first
 * and last rows' words still sit the card's padding from the title and the
 * edge (or a CardFooter, which marks itself `data-card-footer`).
 * It grows to fill an openable card, so content can sit at its foot.
 */
const bodyVariants = cva('grow', {
  variants: {
    layout: {
      default: 'px-(--card-body-padding) pb-(--card-body-padding)',
      rows: '-mt-(--row-padding-y) flex flex-col px-(--card-body-padding) pb-[calc(var(--card-body-padding)-var(--row-padding-y))]',
      flush: 'pb-(--card-body-padding)',
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

/** The padded body: the card's padding on every side, counting the header's space under the title. */
export function CardBody({ layout = 'default', className, children, ...props }: CardBodyProps) {
  return (
    <div className={cn(bodyVariants({ layout }), className)} {...props}>
      {children}
    </div>
  )
}
