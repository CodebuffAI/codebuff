import axios, { AxiosInstance } from "axios";
import { useEffect, useState } from "react";

export default function useAuthenticatedAxios() {
  const [authenticatedAxios, setAuthenticatedAxios] =
    useState<AxiosInstance | null>(null);

  useEffect(() => {
    setAuthenticatedAxios(
      axios.create({
        baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
        withCredentials: true,
      }),
    );
  }, []);

  return {
    authenticatedAxios,
  };
}
