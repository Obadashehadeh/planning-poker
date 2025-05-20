# Planning Poker Application

A collaborative planning poker application built with Angular and WebSockets, designed for agile teams to estimate story points.

## Features

- Create and join planning poker sessions
- Upload and manage tickets from Excel files (JIRA format)
- Vote on tickets using different card systems (Fibonacci, Numbers 1-15, Powers of 2)
- Reveal votes simultaneously
- Automatic calculation of average estimates
- Export estimates to CSV
- Real-time synchronization across devices

## Technology Stack

- **Frontend**: Angular 18
- **Backend**: Node.js with WebSockets (ws)
- **Data Storage**: WebSocket server with in-memory storage + localStorage for persistence

## Getting Started

1. **Install Dependencies**:
   ```bash
   # Install frontend dependencies
   npm install
   
   # Install server dependencies
   cd server
   npm install
