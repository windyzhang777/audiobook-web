# Audiobook Monorepo App

A scalable, full-stack audiobook application built with Node.js, React 19, and TypeScript in a monorepo structure.

## Features

- 📚 Upload and manage audiobooks (TXT, ~~PDF~~, EPUB, ~~MOBI~~)
- 🎧 Text-to-speech reading with Web Speech API
- 📊 Progress tracking for each book
- 🌍 Language detection and intelligent sentence splitting
- 🚀 Scalable monorepo structure with npm workspaces

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+

### Installation

1. Clone the repository
2. Install all dependencies:

```bash
npm run install:all
```

This will install dependencies in the root and all workspace packages.

### Development

Start both client and server in development mode:

```bash
# Start everything
npm run dev

# Or start individually
npm run dev:client  # Client on http://localhost:3000
npm run dev:server  # Server on http://localhost:3001
```

### Building

Build all packages:

```bash
npm run build
```

Build individually:

```bash
npm run build:shared
npm run build:server
npm run build:client
```

### Code Quality

```bash
# Run ESLint on all packages
npm run lint

# Format code with Prettier
npm run format

# Type check all packages
npm run type-check
```

## Features in Detail

### Book Upload

- Supports TXT, ~~PDF~~, EPUB, and ~~MOBI~~ formats
- Duplicate title detection prevents overwrites
- Automatic language detection using Franc
- Intelligent sentence splitting with Intl.Segmenter
- Automatic file cleanup on upload failure

### Text-to-Speech Reader

- Play/pause functionality
- Adjustable reading speed (0.5x - 4.0x)
- Volume control
- Navigate between sentences
- Double click any sentence to jump to it
- Automatic progress saving
- Visual progress indicators

### Progress Tracking

- Real-time progress updates
- Percentage completion
- Line-by-line tracking
- Last read timestamp
- Visual progress bars

## Future Enhancements

- [ ] User authentication and authorization
- [ ] Database integration (PostgreSQL/MongoDB)
- [ ] PDF/MOBI text extraction
- [ ] Bookmarks and notes
- [ ] Multiple voice options
- [ ] Playback history
- [ ] Book collections/playlists
- [ ] Dark mode
- [ ] Mobile responsive improvements
- [ ] Offline support with PWA
- [ ] Export reading statistics

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - feel free to use this project for learning or commercial purposes.

## Acknowledgments

- Built with modern web technologies
- Follows industry best practices for monorepo architecture
- Designed for scalability and maintainability
