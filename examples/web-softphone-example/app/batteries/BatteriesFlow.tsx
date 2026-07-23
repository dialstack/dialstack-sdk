'use client';

// Batteries-included flow: drop the shared `<Softphone />` in and it owns the
// whole experience — dial pad, incoming/ongoing call UI, audio, and controls.
// The `<SoftphoneProvider>` lives one level up in `page.tsx`, so this flow
// renders nothing but the component; swapping to the modular flow keeps the same
// provider (and connection) mounted.
import { Softphone } from '@dialstack/sdk/react';
import styles from './batteries.module.css';

export const BatteriesFlow: React.FC = () => (
  <div className={styles.stage}>
    <p className={styles.caption}>
      One component — <code>&lt;Softphone /&gt;</code> — owns everything below the
      token.
    </p>
    <Softphone />
  </div>
);
