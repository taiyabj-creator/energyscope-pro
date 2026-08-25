const { spawn } = require("child_process");
const path = require("path");

const PYTHON_SCRIPT = path.join(
  __dirname,
  "python",
  "utl_api.py"
);

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

    py.on("error", reject);

        py.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            stderr.trim() || `Python exited with code ${code}`
          )
        );
      }

      try {
        const result = JSON.parse(stdout.trim());

        if (!result || typeof result !== "object") {
          throw new Error("Invalid adapter response.");
        }

        resolve(result);
      } catch (err) {
        reject(
          new Error(
            `Python adapter returned invalid JSON: ${
              err.message
            }`
          )
        );
      }
    });

    py.stdin.write(
      JSON.stringify({
        email,
        password,
      })
    );

    py.stdin.end();
  });
}

module.exports = {
  login,
};
