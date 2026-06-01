/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["18.231.142.114", "localhost:3000"],
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
  experimental: {
    workerThreads: false,
    cpus: 1
  }
};

export default nextConfig;
