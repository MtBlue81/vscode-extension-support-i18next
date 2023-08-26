import vscode from "vscode";
import ts from "typescript";
import path from "path";

const localeFilePath = "src/locales/ja.json";

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
      // カッコ内にafterを表示するために-1
      editor.document.positionAt(end - 1)
    );

    return {
      range,
      renderOptions: {
        after: {
          contentText: "·" + localeObject[key] ?? "No translation",
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
  const pushCalls = (node: ts.CallExpression) => {
    // 識別子を用いた単純な関数呼び出しではない場合は対象外
    if (!ts.isIdentifier(node.expression)) {
      return;
    }

    const name = node.expression.text;
    // 関数名が `t` 以外の場合は対象外
    if (name !== "t") {
      return;
    }

    if (node.arguments.length === 0) {
      return;
    }

    const arg0 = node.arguments[0];
    // 第1引数が文字列リテラル以外の場合は対象外
    if (!ts.isStringLiteral(arg0)) {
      return;
    }

    const key = arg0.text;
    calls.push({ key, start: node.getStart(), end: node.getEnd() });
  };

  const search = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      pushCalls(node);
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
