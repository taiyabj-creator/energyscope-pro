const { spawn } = require("child_process");
const path = require("path");

const PYTHON_SCRIPT = path.join(__dirname, "python", "utl_api.py");

// Cross-platform fallback: Oracle Ubuntu has `python3` but not `python`, while
// Windows often only has `python`. We always try `python3` first (so production
// is unaffected) and only fall back to `python` when `python3` is missing.
// `process.env.PYTHON_BIN` always takes precedence when explicitly configured.
function pythonBinCandidates() {
  if (process.env.PYTHON_BIN) return [process.env.PYTHON_BIN, "python3", "python"];
  return ["python3", "python"];
}

function runLogin(executable, email, password) {
  return new Promise((resolve, reject) => {
    let py;
    try {
      py = spawn(executable, [PYTHON_SCRIPT]);
    } catch (err) {
      return reject(err);
    }

    let stdout = "";
    let stderr = "";

    // If the binary could not be launched (e.g. missing on this OS), Node emits
    // this 'error' event with code ENOENT before 'close'. Rejecting here lets
    // login() fall back to the next candidate. A script that started but exited
    // non-zero is surfaced via the 'close' handler below instead.
    py.on("error", (err) => {
      reject(err);
    });

    py.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    py.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    py.on("close", (code) => {
      if (code !== 0) {
        const e = new Error(`Python adapter exited with code ${code}: ${stderr.trim()}`);
        e.code = code;
        return reject(e);
      }

      let result;
      try {
        result = JSON.parse(stdout.trim());
      } catch (err) {
        return reject(err);
      }

      if (!result || typeof result !== "object") {
        return reject(new Error("Python adapter returned non-object response"));
      }

      resolve(result);
    });

    // Ignore stdin write errors: on a failed spawn, stdin may already be closed.
    try {
      py.stdin.write(
        JSON.stringify({
          email,
          password,
        }),
      );
      py.stdin.end();
    } catch (_) {
      /* stdin write failed; the error/close handlers will settle the promise */
    }
  });
}

async function login(email, password) {
  let lastError = null;
  for (const executable of pythonBinCandidates()) {
    try {
      return await runLogin(executable, email, password);
    } catch (err) {
      // Only continue to the next candidate when the binary itself could not be
      // launched (e.g. missing executable on this OS). A launched-but-failed run
      // is a real authentication/script error and must not silently retry.
      lastError = err;
      if (err.code !== "ENOENT") {
        console.error("Python adapter failed:", executable, err.message);
        const e = new Error("AUTH_SERVICE_ERROR");
        e.code = "AUTH_SERVICE_ERROR";
        throw e;
      }
    }
  }

  // All candidates failed to spawn (e.g. no Python installed at all).
  console.error("Python adapter spawn error:", lastError?.message || "no python executable found");
  const e = new Error("AUTH_SERVICE_ERROR");
  e.code = "AUTH_SERVICE_ERROR";
  throw e;
}

module.exports = {
  login,
};
