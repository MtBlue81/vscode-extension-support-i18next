import vscode from "vscode";
import ts from "typescript";
import path from "path";

const localeFilePath = "src/locales/ja.json";
const simpleCalls = ["t"];
const objectCalls: Record<string, string[]> = {
  errorDialogOperations: ["showMessage"],
  snackbarOperations: [
    "showInfoMessage",
    "showErrorMessage",
    "showSuccessMessage",
    "showWarningMessage",
  ],
};

export const activate = (context: vscode.ExtensionContext) => {
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateDecorations)
  );

  vscode.workspace.onDidChangeTextDocument(() =>
    updateDecorations(vscode.window.activeTextEditor)
  );

  updateDecorations(vscode.window.activeTextEditor);
};

const decorationType = vscode.window.createTextEditorDecorationType({
  opacity: "1",
});
const updateDecorations = async (editor?: vscode.TextEditor) => {
  if (!editor) {
    return;
  }
  const language = editor.document.languageId;
  if (language !== "typescript" && language !== "typescriptreact") {
    return;
  }

  const code = editor.document.getText();
  const calls = findFunctionCalls(code, language === "typescriptreact");
  const localeObject = await getLocaleObject();
  const decorations = calls.map(({ start, end, key }) => {
    const range = new vscode.Range(
      editor.document.positionAt(start),
      editor.document.positionAt(end)
    );

    return {
      range,
      renderOptions: {
        after: {
          contentText: `· ${localeObject[key] ?? "No translation"}`,
          opacity: "0.6",
        },
      },
    };
  });

  editor.setDecorations(decorationType, decorations);
};

type FunctionCall = {
  key: string;
  start: number;
  end: number;
};

const findFunctionCalls = (code: string, isReact: boolean): FunctionCall[] => {
  const sourceFile = ts.createSourceFile(
    "_.ts",
    code,
    ts.ScriptTarget.ESNext,
    true,
    isReact ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const calls: FunctionCall[] = [];
  const conditionalCheck = (node: ts.Node) => {
    if (ts.isConditionalExpression(node)) {
      conditionalCheck(node.whenFalse);
      conditionalCheck(node.whenTrue);
    } else if (ts.isStringLiteral(node)) {
      calls.push({
        key: node.text,
        start: node.getStart(),
        end: node.getEnd(),
      });
    }
  };

  const search = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      // errorDialogOperations, snackbarOperationsの場合
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression)
      ) {
        const objName = node.expression.expression.text;
        const fnName = node.expression.name.text;
        if (objectCalls[objName] && objectCalls[objName].includes(fnName)) {
          const arg = node.arguments[0];
          conditionalCheck(arg);
        }
        return;
      }

      // シンプルなt関数の場合
      if (
        ts.isIdentifier(node.expression) &&
        simpleCalls.includes(node.expression.text)
      ) {
        const arg0 = node.arguments[0];
        conditionalCheck(arg0);
        return;
      }
    }

    ts.forEachChild(node, search);
  };

  search(sourceFile);

  return calls;
};

const getLocaleObject = async (): Promise<Record<string, string>> => {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    console.error("No workspace folder found");
    return {};
  }
  const workspacePath = folders[0].uri.fsPath;
  const filePath = path.resolve(workspacePath, localeFilePath);
  const fileUri = vscode.Uri.file(filePath);

  try {
    const document = await vscode.workspace.openTextDocument(fileUri);
    return JSON.parse(document.getText());
  } catch (err) {
    console.error(`Error parsing JSON from file: ${filePath}`);
    return {};
  }
};
