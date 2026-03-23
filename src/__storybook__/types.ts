import type { Theme, DIDItem } from '../types';

/**
 * Extra args handled by the Storybook preview decorator (theme switching, empty state).
 * Stories use `Meta<DecoratorArgs>` to type these args without `as any`.
 */
export interface DecoratorArgs {
  theme?: Theme;
  _empty?: boolean;
  dids?: DIDItem[];
}
