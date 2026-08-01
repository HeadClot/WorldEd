/** Discrete keyboard actions for modal transform drags. */
export enum TransformModalKeyboardAction {
  ToggleAxisX = 'toggle_axis_x',
  ToggleAxisY = 'toggle_axis_y',
  ToggleAxisZ = 'toggle_axis_z',
  AppendDigit = 'append_digit',
  AppendDecimal = 'append_decimal',
  ToggleSign = 'toggle_sign',
  Backspace = 'backspace',
  Confirm = 'confirm',
  Cancel = 'cancel',
}

/** Payload for a routed modal keyboard event. */
export interface TransformModalKeyboardEvent {
  action: TransformModalKeyboardAction;
  /** Digit character when action is AppendDigit. */
  digit?: string;
}
