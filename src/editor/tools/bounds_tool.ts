import { TransformMode } from '@/types/transform_mode.js';
import { BoxSelectTool } from './box_select_tool.js';
import { BoundsWidget } from '../widgets/bounds_widget.js';

/**
 * Permanent bounds tool (Shape Editor-style tool + widget): object selection
 * via BoxSelectTool base, bounds gizmo owned by BoundsWidget only.
 */
export class BoundsTool extends BoxSelectTool {
  private readonly boundsWidget: BoundsWidget;

  /** Creates a bounds tool. */
  constructor() {
    super();
    this.boundsWidget = new BoundsWidget();
  }

  /** Called when the tool is activated. */
  override onActivate(): void {
    super.onActivate();
    this.activateBoundsWidgetPath();
  }

  /** Called when the tool is rendered. */
  override onRender(): void {
    super.onRender();
    this.updateBoundsWidgetVisibility();
  }

  /** Permanent path: bounds mode and BoundsWidget (Shape Editor AddWidget). */
  private activateBoundsWidgetPath(): void {
    const services = this.editor?.getServices();
    if (!services || !this.editor) {
      return;
    }
    services.setWidgetMode(TransformMode.BOUNDS);
    services.refreshGizmoPresentation();
    services.setStatusMessage('Bounds');
    this.editor.addWidget(this.boundsWidget);
    this.updateBoundsWidgetVisibility();
  }

  /** Shows the bounds widget when there is a selection. */
  private updateBoundsWidgetVisibility(): void {
    if (!this.editor) {
      return;
    }
    this.boundsWidget.visible = this.editor.selectedSegmentsCount > 0;
  }
}
