import { useAuth } from "@clerk/nextjs";
import axios, { AxiosInstance } from "axios";
import { useState } from "react";

export default function useAuthenticatedAxios() {
  const { getToken } = useAuth();
  const [authenticatedAxios, setAuthenticatedAxios] =
    useState<AxiosInstance | null>(null);

  getToken().then((token) => {
    setAuthenticatedAxios(
      axios.create({
        baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
    );
  });

  return {
    authenticatedAxios,
  };
}
