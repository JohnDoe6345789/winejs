describe('WineJS smoke test', () => {
  it('loads the shell and surfaces simulated console output', () => {
    cy.visit('/index.html');
    cy.window().then((win) => {
      // Return canned simulation results so the UI flows deterministically.
      win.WineJS.prototype.simulateBinary = () => ({
        consoleLines: ['Intercepted text'],
        guiIntent: false,
        importTrace: [{ dll: 'kernel32.dll', name: 'WriteConsoleA' }],
      });
    });

    cy.get('#exeFile').selectFile(
      {
        contents: Cypress.Buffer.from('Sample console string\n'),
        fileName: 'Sample.exe',
        mimeType: 'application/octet-stream',
      },
      { force: true },
    );

    cy.get('#statusBar').should('contain.text', 'Sample.exe');
    cy.get('#consoleOutput').should('contain.text', '[WineJS] Intercepted text');
    cy.get('#stringList .stringList__item').first().should('contain.text', 'Sample console string');
  });
});
