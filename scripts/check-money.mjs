import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export function checkSchemaMoney(schema) {
  return schema.split(/\r?\n/).flatMap((line, index) => {
    const code = line.replace(/\/\/.*$/, "");
    // Rates are not money, so they keep four decimals.
    const rate = /^\s*(gatewayFeeRate|agentFeeRate)\s+Decimal\s.*@db\.Decimal\(6,\s*4\)/.test(code);
    return /^\s*\w+\s+Decimal\??\b/.test(code) && !/@db\.Decimal\(14,\s*2\)/.test(code) && !rate
      ? [`prisma/schema.prisma:${index + 1}: Decimal fields must use @db.Decimal(14, 2)`]
      : [];
  });
}

/** Type-aware narrow guard, not a proof that every financial path is safe. */
export function checkSourceMoney(program, files) {
  const checker = program.getTypeChecker();
  const failures = [];
  const decimal = (type) => {
    if (type.isUnionOrIntersection()) return type.types.some(decimal);
    return ["toDecimalPlaces", "toFixed", "plus", "times"].every((name) => type.getProperty(name));
  };
  const arithmetic = new Set([
    ts.SyntaxKind.PlusToken,
    ts.SyntaxKind.MinusToken,
    ts.SyntaxKind.AsteriskToken,
    ts.SyntaxKind.SlashToken,
    ts.SyntaxKind.PercentToken,
    ts.SyntaxKind.AsteriskAsteriskToken,
    ts.SyntaxKind.PlusEqualsToken,
    ts.SyntaxKind.MinusEqualsToken,
    ts.SyntaxKind.AsteriskEqualsToken,
    ts.SyntaxKind.SlashEqualsToken,
  ]);
  for (const file of files) {
    const report = (node, message) => {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
      failures.push(`${path.relative(process.cwd(), file.fileName)}:${line + 1}: ${message}`);
    };
    const visit = (node) => {
      if (
        ts.isBinaryExpression(node) &&
        arithmetic.has(node.operatorToken.kind) &&
        [node.left, node.right].some((operand) => decimal(checker.getTypeAtLocation(operand)))
      )
        report(node, "Use Decimal methods for arithmetic on monetary values");
      if (
        ts.isCallExpression(node) &&
        /^(Number|parseFloat|parseInt|Number\.parseFloat|Number\.parseInt)$/.test(
          node.expression.getText(file),
        ) &&
        node.arguments.some((argument) => {
          if (decimal(checker.getTypeAtLocation(argument))) return true;
          return (
            ts.isCallExpression(argument) &&
            ts.isPropertyAccessExpression(argument.expression) &&
            decimal(checker.getTypeAtLocation(argument.expression.expression))
          );
        })
      )
        report(node, "Do not convert a Decimal amount through a JavaScript number");
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const files = program.getSourceFiles().filter((file) => {
    const relative = path.relative(process.cwd(), file.fileName).replaceAll("\\", "/");
    return (
      relative.startsWith("src/") &&
      !relative.startsWith("src/generated/") &&
      !file.isDeclarationFile
    );
  });
  const failures = [
    ...checkSchemaMoney(fs.readFileSync("prisma/schema.prisma", "utf8")),
    ...checkSourceMoney(program, files),
  ];
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else console.log("Monetary structural checks passed; domain review and tests remain required.");
}
