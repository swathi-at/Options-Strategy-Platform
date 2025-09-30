import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:3001/api', // Swati's backend server URL
  headers: {
    'Content-Type': 'application/json',
  },
});

export const calculateStrategy = (data) => {
  return apiClient.post('/calculate', data);
};