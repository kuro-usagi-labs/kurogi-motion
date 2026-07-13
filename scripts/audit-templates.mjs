import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true },
});

try {
  const catalog = await server.ssrLoadModule("/src/core/templateCatalog.ts");
  const reports = catalog.auditAllCatalogTemplates();
  const errors = reports.flatMap((report) => report.errors.map((issue) => ({ template: report.templateId, ...issue })));
  const warnings = reports.flatMap((report) => report.warnings.map((issue) => ({ template: report.templateId, ...issue })));

  for (const report of reports) {
    const status = report.errors.length ? "FAIL" : report.warnings.length ? "WARN" : "PASS";
    console.log(`${status.padEnd(4)} ${String(report.templateId).padEnd(20)} ${report.errors.length} errors · ${report.warnings.length} warnings`);
  }

  if (warnings.length) {
    console.log("\nTemplate warnings:");
    for (const warning of warnings) console.log(`- [${warning.template}] ${warning.code} · ${warning.layerName}: ${warning.message}`);
  }

  if (errors.length) {
    console.error("\nTemplate audit failed:");
    for (const error of errors) console.error(`- [${error.template}] ${error.code} · ${error.layerName}: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log(`\nTemplate audit passed: ${reports.length} templates, 0 blocking errors.`);
  }
} finally {
  await server.close();
}
