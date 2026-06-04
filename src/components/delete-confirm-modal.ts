import { Modal, Setting, App } from 'obsidian';

export class DeleteConfirmModal extends Modal {
  private fileName: string;
  private onConfirm: () => void;

  constructor(app: App, fileName: string, onConfirm: () => void) {
    super(app);
    this.fileName = fileName;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl('p', {
      text: `Are you sure you want to move "${this.fileName}" to trash ?`,
    });

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.close()))
      .addButton((btn) =>
        btn
          .setButtonText('Move to trash')
          .setCta()
          .onClick(() => {
            this.onConfirm();
            this.close();
          }),
      );
  }
}
