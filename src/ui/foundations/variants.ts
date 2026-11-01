import type { VariantProps } from 'class-variance-authority'

/**
 * One axis of a cva recipe as a prop type (`tone: VariantOf<typeof badgeVariants, 'tone'>`),
 * so the recipe names each value once. It leaves out cva's `null`, which skips
 * the axis and its default.
 */
export type VariantOf<
  Recipe extends (...args: never) => string,
  Axis extends keyof VariantProps<Recipe>,
> = NonNullable<VariantProps<Recipe>[Axis]>
