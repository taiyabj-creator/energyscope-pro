const { spawn } = require("child_process");
const path = require("path");

const PYTHON_SCRIPT = path.join(__dirname, "python", "utl_api.py");

async function login(email, password) {
  return new Promise((resolve, reject) => {
    const py = spawn(process.env.PYTHON_BIN || "python3", [PYTHON_SCRIPT]);

    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    py.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    py.on("error", (err) => {
      console.error("Python adapter spawn error:", err.message);
      const e = new Error("AUTH_SERVICE_ERROR");
      e.code = "AUTH_SERVICE_ERROR";
      reject(e);
    });

    py.on("close", (code) => {
      if (code !== 0) {
        console.error("Python adapter exited with code", code, ":", stderr.trim());
        const e = new Error("AUTH_SERVICE_ERROR");
        e.code = "AUTH_SERVICE_ERROR";
        return reject(e);
      }

      try {
        const result = JSON.parse(stdout.trim());

        if (!result || typeof result !== "object") {
          console.error("Python adapter returned non-object response");
          const e = new Error("AUTH_SERVICE_ERROR");
          e.code = "AUTH_SERVICE_ERROR";
          return reject(e);
        }

        resolve(result);
      } catch (err) {
        console.error("Python adapter JSON parse error:", err.message);
        const e = new Error("AUTH_SERVICE_ERROR");
        e.code = "AUTH_SERVICE_ERROR";
        reject(e);
      }
    });

    py.stdin.write(
      JSON.stringify({
        email,
        password,
      }),
    );

    py.stdin.end();
  });
}

module.exports = {
  login,
};
