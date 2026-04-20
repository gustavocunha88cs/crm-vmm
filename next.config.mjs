/** @type {import('next').NextConfig} */
const nextConfig = {
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
