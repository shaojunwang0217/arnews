module.exports = {
  port: process.env.PORT || 3005,

  // Site info
  site: {
    title: 'The Repository',
    subtitle: 'Censorship-resistant news & commentary',
    description: 'Independent news, permanently stored on Arweave. Immutable, uncensorable journalism.',
    url: 'https://claw.sgcondo.app/news',
    author: 'Shaojun Wang',
    language: 'en',
    locale: 'en_US'
  },

  // Arweave wallet (optional — blog works without it)
  arweave: {
    walletPath: process.env.AR_WALLET || __dirname + '/data/wallet.json',
    gateway: 'https://arweave.net'
  },

  // Paths
  paths: {
    posts: __dirname + '/posts',
    registry: __dirname + '/posts/index.json',
    public: __dirname + '/public'
  }
};
