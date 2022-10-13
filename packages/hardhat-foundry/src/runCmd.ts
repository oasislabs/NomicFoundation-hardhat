import { exec } from "child_process";

export async function runCmd(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const child = exec(cmd);
    if (child.stdout === null) {
      throw new Error("stdout null");
    }

    child.stdout.on("data", (data) => (output += data.toString()));

    child.stdout.on("close", () => {
      try {
        resolve(output);
      } catch (e) {
        reject(e);
      }
    });

    child.on("exit", (code) => {
      if (code !== 0) {
        reject("forge not installed");
      }
    });
  });
}
