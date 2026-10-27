const { spawn } = require('node:child_process');

const isReplit = Boolean(
  process.env.REPLIT_EXPO_SESSION_SECRET ||
  process.env.REPLIT_DEV_DOMAIN ||
  process.env.REPL_ID ||
  process.env.REPLIT_INTERNAL_APP_DOMAIN
);

const env = { ...process.env };
if (process.env.REPLIT_DEV_DOMAIN) {
  env.EXPO_PUBLIC_DOMAIN = process.env.REPLIT_DEV_DOMAIN;
  env.REACT_NATIVE_PACKAGER_HOSTNAME = process.env.REPLIT_DEV_DOMAIN;
}
if (process.env.REPL_ID) {
  env.EXPO_PUBLIC_REPL_ID = process.env.REPL_ID;
}

const args = ['exec', 'expo', 'start', '--localhost'];
if (process.env.PORT && /^\d+$/.test(process.env.PORT)) {
  args.push('--port', process.env.PORT);
}

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: require('node:path').resolve(__dirname, '..'),
      env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? signal}`));
    });
  });
}

async function main() {
  if (isReplit && process.env.REPLIT_EXPO_SESSION_SECRET) {
    try {
      await run('pnpm', [
        'exec',
        'create-launch',
        'login',
        '--session',
        process.env.REPLIT_EXPO_SESSION_SECRET,
      ]);
    } catch (error) {
      console.warn('Optional Replit launch login failed; continuing with Expo:', error.message);
    }
  }
  await run('pnpm', args);
}

main().catch((error) => {
  console.error('Expo development startup failed:', error.message);
  process.exitCode = 1;
});
