import { BrowserWindow } from 'electrobun/bun';

new BrowserWindow({
  title: 'AiWorldEd',
  url: 'views://main_ui/index.html',
  frame: {
    x: 80,
    y: 60,
    width: 1600,
    height: 1000
  }
});
