import type { DirectoryContact } from '@dialstack/sdk-react/softphone';

// A stand-in for your own directory. Swap the destinations for extensions and
// numbers that exist on your account before transferring to them.
export const sampleDirectory: DirectoryContact[] = [
  { id: 'reception', label: 'Reception', destination: '100' },
  {
    id: 'support',
    label: 'Support',
    destination: '200',
    description: 'Ext. 200',
    group: 'Departments',
    tags: ['24/7'],
  },
  { id: 'sales', label: 'Sales', destination: '300', description: 'Ext. 300', group: 'Departments' },
  { id: 'after-hours-line', label: 'After-hours line', destination: '+14155550100', group: 'External' },
];
