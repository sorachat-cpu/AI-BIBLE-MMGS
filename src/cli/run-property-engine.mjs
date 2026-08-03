#!/usr/bin/env node
import { runPropertyEngine, PropertyEngineError } from "../engines/property-engine.mjs";

async function main() {
  const argText = process.argv.slice(2).join(" ").trim();
  const rawInputText = argText || (await readStdin());

  if (!rawInputText) {
    console.error("Usage: npm run property:run -- \"<raw listing text>\"");
    console.error('   or: echo "<raw listing text>" | npm run property:run');
    process.exitCode = 1;
    return;
  }

  try {
    const result = await runPropertyEngine(rawInputText);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    if (err instanceof PropertyEngineError) {
      console.error(`[${err.code}] ${err.message}`);
    } else {
      console.error(err);
    }
    process.exitCode = 1;
  }
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
  });
}

main();
