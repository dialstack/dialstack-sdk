/**
 * English strings for the dial-plan editor.
 *
 * Lives here rather than in the browser package because nothing there used it —
 * `<DialPlan>` is the only consumer. Keeping React's own data in React's package
 * is part of what lets `@dialstack/sdk-js` be a peer rather than a dependency.
 */

import type { DialPlanLocale } from '@dialstack/sdk-js';

/**
 * Default DialPlanLocale — full locale object for the DialPlan component.
 * Used as the default when no locale prop is provided.
 */

export const defaultDialPlanLocale: DialPlanLocale = {
  nodeTypes: {
    start: 'Start',
    schedule: 'Schedule',
    internalDial: 'Internal Extension',
    voicemail: 'Voicemail',
    externalDial: 'External Number',
    ringAllUsers: 'Ring All Users',
    voiceApp: 'Voice App',
    menu: 'IVR Menu',
    audioClip: 'Audio Clip',
    hangUp: 'Hang Up',
  },
  exits: {
    open: 'Open',
    closed: 'Closed',
    holiday: 'Holiday',
    next: 'Next',
    timeout: 'Timeout',
    invalid: 'Invalid',
  },
  nodeDescriptions: {
    schedule: 'Route calls by schedule',
    internalDial: 'Ring a user, group, or plan',
    voicemail: 'Send to voicemail',
    ringAllUsers: 'Ring all users',
    externalDial: 'Ring an external phone number',
    voiceApp: 'Route to a voice application',
    menu: 'Play prompt and route by keypress',
    audioClip: 'Play an audio clip',
    hangUp: 'End the call',
  },
  targetTypes: {
    user: 'User',
    ringGroup: 'Ring Group',
    dialPlan: 'Dial Plan',
    queue: 'Queue',
    voiceApp: 'Voice App',
    sharedVoicemail: 'Shared Voicemail',
  },
  resourceGroups: {
    users: 'Users',
    ringGroups: 'Ring Groups',
    dialPlans: 'Dial Plans',
    queues: 'Queues',
    voiceApps: 'Voice Apps',
    sharedVoicemails: 'Shared Voicemails',
    schedules: 'Schedules',
    audioClips: 'Audio Clips',
  },
  configLabels: {
    timeout: 'Timeout (seconds)',
    target: 'Target',
    schedule: 'Schedule',
    search: 'Search...',
    searchTargets: 'Search targets...',
    searchSchedules: 'Search schedules...',
    openInNewTab: 'Open target details',
    promptClip: 'Prompt',
    audioClip: 'Audio Clip',
    digit: 'Digit',
    options: 'Options',
    addOption: 'Add Option',
    removeOption: 'Remove',
    optionLabel: 'Label',
    optionLabelPlaceholder: 'e.g. Sales',
    routeHolidaySeparately: 'Route holidays separately',
    routeHolidaySeparatelyHint:
      'When on, holidays route to a dedicated branch you wire below. Otherwise holidays follow the Closed exit.',
    mode: 'Mode',
    phoneNumber: 'Phone Number',
    phoneNumberInvalid: 'Enter a valid phone number, for example (415) 555-1234.',
    clearPhoneNumber: 'Clear phone number',
  },
  voiceAppMode: {
    control: 'Control',
    notify: 'Notify',
    controlBadge: 'Control mode',
    notifyBadge: 'Notify mode',
    controlHint: 'Hands the call off to the voice app, which takes over the conversation.',
    notifyHint:
      'Notifies the voice app of the call in the background. The dial plan keeps routing via Next without waiting.',
  },
  toolbar: {
    autoLayout: 'Auto Layout',
    save: 'Save',
  },
  panel: {
    delete_: 'Delete',
    close: 'Close',
    connection: 'Connection',
    from: 'From',
    exit: 'Exit',
    to: 'To',
  },
  combobox: {
    select: '— Select —',
    search: 'Search...',
    noResults: 'No results found',
    loading: 'Loading...',
    createNew: '+ Create new...',
    extensionLabel: 'Ext.',
    noName: '(No name)',
  },
  status: {
    loading: 'Loading dial plan...',
    loadError: 'Failed to load dial plan',
    notFound: 'No dial plan found',
    saveError: 'Failed to save dial plan',
    newDialPlan: 'New Dial Plan',
  },
};
