import { stdin, stdout } from "node:process";
import { createInterface, emitKeypressEvents, type Key } from "node:readline";

export function assertInteractiveTerminal() {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("This command must be run in an interactive terminal.");
  }
}

export async function readVisible(label: string) {
  assertInteractiveTerminal();
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    return await new Promise<string>((resolve) => {
      prompt.question(label, resolve);
    });
  } finally {
    prompt.close();
  }
}

export async function readHidden(label: string) {
  assertInteractiveTerminal();
  stdout.write(label);
  emitKeypressEvents(stdin);

  const wasRaw = Boolean(stdin.isRaw);
  const wasPaused = stdin.isPaused();
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise<string>((resolve, reject) => {
    let value = "";

    const cleanup = () => {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(wasRaw);
      if (wasPaused) {
        stdin.pause();
      }
    };

    const finish = () => {
      cleanup();
      stdout.write("\n");
      resolve(value);
    };

    const cancel = () => {
      cleanup();
      value = "";
      stdout.write("\n");
      reject(new Error("Interactive prompt cancelled."));
    };

    const onKeypress = (character: string, key: Key) => {
      if ((key.ctrl && key.name === "c") || (key.ctrl && key.name === "d")) {
        cancel();
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        finish();
        return;
      }
      if (key.name === "backspace") {
        if (value) {
          value = Array.from(value).slice(0, -1).join("");
          stdout.write("\b \b");
        }
        return;
      }
      if (
        character &&
        !key.ctrl &&
        !key.meta &&
        !/[\u0000-\u001f\u007f]/.test(character)
      ) {
        value += character;
        stdout.write("*".repeat(Array.from(character).length));
      }
    };

    stdin.on("keypress", onKeypress);
  });
}
