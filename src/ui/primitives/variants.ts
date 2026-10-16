/** Class variants (cva) of the primitives – kept separate so component files only export components. */
import { cva, type VariantProps } from 'class-variance-authority';

/** Button styles (DESIGN §5.1). */
export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap select-none',
    'transition-[background-color,color,transform,box-shadow] duration-[var(--zz-dur-fast)] ease-out',
    'disabled:bg-surface-2 disabled:text-disabled disabled:shadow-none disabled:active:scale-100',
    'aria-disabled:bg-surface-2 aria-disabled:text-disabled',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent font-semibold hover:bg-accent-hover active:bg-accent-active active:scale-[0.98]',
        secondary: 'bg-surface-3 text-text hover:bg-[color-mix(in_srgb,var(--zz-surface-3),var(--zz-text)_6%)] active:scale-[0.98]',
        ghost: 'bg-transparent text-text hover:bg-surface-2 active:bg-surface-3',
        danger: 'bg-danger text-on-danger hover:bg-[color-mix(in_srgb,var(--zz-danger),black_8%)] active:scale-[0.98]',
        link: 'h-auto bg-transparent px-0 text-accent-text underline-offset-4 hover:underline disabled:bg-transparent',
      },
      size: {
        sm: 'h-9 px-3 text-body-sm pointer-coarse:min-h-11 [&_svg]:size-4',
        md: 'h-11 px-4 text-body [&_svg]:size-5',
        lg: 'h-13 px-6 text-[18px] leading-6 font-semibold [&_svg]:size-[22px]',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    compoundVariants: [
      { variant: 'primary', size: 'lg', class: 'shadow-button' },
      { variant: 'secondary', size: 'lg', class: 'shadow-button' },
      { variant: 'link', size: ['sm', 'md', 'lg'], class: 'h-auto px-0' },
    ],
    defaultVariants: { variant: 'primary', size: 'md', fullWidth: false },
  },
);

/** Button variant props. */
export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

/** Pill badge tones. */
export const badgeVariants = cva('inline-flex h-6 items-center gap-1 rounded-full px-2 text-caption tabular-nums', {
  variants: {
    tone: {
      neutral: 'bg-surface-3 text-text',
      accent: 'bg-accent-subtle text-accent-text',
      warning: 'bg-warning-subtle text-warning-text',
      danger: 'bg-danger-subtle text-danger-text',
      info: 'bg-info-subtle text-info-text',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

/** Badge variant props. */
export type BadgeVariantProps = VariantProps<typeof badgeVariants>;
