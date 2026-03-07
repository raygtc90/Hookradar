# Contributing to HookRadar 🛰️

Thank you for your interest in contributing to HookRadar! This document provides guidelines and information about contributing to this project.

## 🌟 Ways to Contribute

You don't need to be a coding expert to contribute! Here are all the ways you can help:

| Type | Language/Skill Needed | Difficulty |
|------|----------------------|------------|
| 🐛 Bug Fix / Feature | JavaScript/Node.js | Medium |
| 📝 Documentation | English | Easy |
| 🎨 UI Design | CSS/Figma | Easy-Medium |
| 🧪 Testing | Basic JS knowledge | Easy |
| 🐞 Issue Reporting | None | Very Easy |
| 🌐 README Translation | Any language | Easy |

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Git

### Setup

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/hookradar.git
cd hookradar

# 3. Install dependencies
npm install

# 4. Start the development server
npm run dev

# 5. Open http://localhost:5173 in your browser
```

## 📋 Development Workflow

### Creating a Branch

```bash
# Create a new branch for your feature/fix
git checkout -b feature/my-amazing-feature

# Or for bug fixes
git checkout -b fix/bug-description
```

### Making Changes

1. Make your changes in the appropriate files
2. Test your changes locally
3. Ensure the app runs without errors

### Commit Guidelines

We follow conventional commits:

```bash
# Features
git commit -m "feat: add webhook signature verification"

# Bug fixes
git commit -m "fix: resolve WebSocket reconnection issue"

# Documentation
git commit -m "docs: update API endpoint documentation"

# Styling
git commit -m "style: improve request detail layout"
```

### Submitting a Pull Request

1. Push your branch to your fork
2. Open a Pull Request against the `main` branch
3. Fill in the PR template with:
   - What changes you made
   - Why you made them
   - Screenshots (if UI changes)
4. Wait for review

## 🏗️ Project Structure

```
hookradar/
├── server/                 # Backend
│   ├── server.js          # Express + WebSocket server
│   └── database.js        # SQLite database setup
├── src/                   # Frontend (React)
│   ├── components/        # React components
│   ├── utils/             # Utility functions
│   ├── App.jsx           # Main app component
│   ├── main.jsx          # Entry point
│   └── index.css         # Global styles
├── public/               # Static assets
├── index.html            # HTML template
├── vite.config.js        # Vite configuration
└── package.json          # Dependencies
```

## 🐛 Reporting Bugs

Found a bug? Please create an issue with:

1. **Title**: Short, descriptive title
2. **Environment**: OS, Node.js version, browser
3. **Steps to Reproduce**: Exactly what you did
4. **Expected Behavior**: What should happen
5. **Actual Behavior**: What actually happened
6. **Screenshots**: If applicable

## 💡 Suggesting Features

Have an idea? Create an issue with:

1. **Title**: `[Feature] Your feature title`
2. **Description**: What the feature should do
3. **Use Case**: Why it's needed
4. **Mockup**: Optional design/wireframe

## 🏷️ Good First Issues

Look for issues labeled `good first issue` — these are great for newcomers!

Examples of good first contributions:
- Fix a typo in documentation
- Add a missing tooltip
- Improve error messages
- Add unit tests
- Translate README to your language

## 📜 Code Style

- Use ES6+ JavaScript features
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused
- Use the existing CSS design system (variables in `index.css`)

## 🤝 Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Provide constructive feedback
- Focus on the best outcome for the community

## 📞 Getting Help

- 💬 Open a Discussion on GitHub
- 🐛 Create an Issue for bugs
- 📧 Email: [aniketmishra492@gmail.com]

---

**Thank you for making HookRadar better! Every contribution matters.** 🛰️
