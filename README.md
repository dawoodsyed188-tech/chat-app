# Realtime Chat App

A real-time chat application built with React, Express, Socket.io, and MongoDB.

## Features

- Real-time messaging with Socket.io
- User authentication with JWT
- Room-based chat
- Message persistence with MongoDB
- Responsive UI with React

## Tech Stack

- **Frontend:** React, Vite, Socket.io-client
- **Backend:** Node.js, Express, Socket.io
- **Database:** MongoDB Atlas
- **Authentication:** JWT, bcrypt

## Local Development

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or Atlas)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd realtime-chat-app
   ```

2. Install dependencies:
   ```bash
   npm run install:all
   ```

3. Set up environment variables:
   - Copy `server/.env.example` to `server/.env`
   - Update the values as needed

4. Start the development servers:
   ```bash
   npm run dev
   ```

5. Open your browser to `http://localhost:5173`

## Deployment

### Backend (Render)

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set root directory to `server`
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Add environment variables in Render dashboard

### Frontend (Vercel)

1. Create a new project on Vercel
2. Connect your GitHub repository
3. Set root directory to `client`
4. Add environment variable: `VITE_API_URL` pointing to your Render backend URL
5. Deploy

## Environment Variables

### Server (.env)

- `PORT`: Server port (default: 5000)
- `CLIENT_ORIGIN`: Frontend URL (e.g., http://localhost:5173 for dev, your Vercel URL for prod)
- `MONGO_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for JWT tokens

### Client

- `VITE_SERVER_URL`: Backend server URL (set in Vercel environment variables)

## API Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/rooms` - Get chat rooms
- `POST /api/rooms` - Create a room
- `GET /api/messages/:roomId` - Get messages for a room

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT
