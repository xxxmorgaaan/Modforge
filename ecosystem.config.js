module.exports = {
  apps: [
    {
      name: 'modforge',
      script: 'server/server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
