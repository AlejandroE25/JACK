import { PACEMessage, Memory, ConversationMessage } from '../../src/types/index.js';

export const mockMessages = {
  greeting: 'Hello PACE',
  question: 'What is the weather?',
  command: 'Tell me the news',
  math: 'What is 2 + 2?',
  remember: 'Remember that my favorite color is blue',
  recall: 'What is my favorite color?',
};

export const mockResponses = {
  greeting: 'Hello! I am PACE, your personal assistant.',
  weather: 'It is 72°F and sunny in Boston.',
  news: 'Top story: TypeScript 5.7 Released',
  math: '2 + 2 equals 4',
  remembered: 'I will remember that your favorite color is blue.',
  recalled: 'Your favorite color is blue.',
};

export const mockPACEMessages: PACEMessage[] = [
  { query: mockMessages.greeting, response: mockResponses.greeting },
  { query: mockMessages.question, response: mockResponses.weather },
  { query: mockMessages.command, response: mockResponses.news },
];

export const mockMemories: Memory[] = [
  {
    id: 1,
    timestamp: new Date().toISOString(),
    topic: 'user_preferences',
    content: 'User favorite color is blue',
    importance: 7,
    tags: 'favorite,color,preference',
  },
  {
    id: 2,
    timestamp: new Date().toISOString(),
    topic: 'user_info',
    content: 'User is a software developer',
    importance: 8,
    tags: 'occupation,developer,software',
  },
];

export const mockConversation: ConversationMessage[] = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi! How can I help you today?' },
  { role: 'user', content: 'What is the weather?' },
  { role: 'assistant', content: 'It is 72°F and sunny.' },
];
