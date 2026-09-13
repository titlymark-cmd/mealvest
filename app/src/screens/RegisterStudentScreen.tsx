import React from "react";
import RegisterScreen from "./RegisterScreen";

// Thin wrapper so the navigator can register two distinct routes
// (RegisterStudent / RegisterHotel) that both render the same shared
// RegisterScreen component with a different `mode`.
export default function RegisterStudentScreen(props: any) {
  return <RegisterScreen {...props} mode="student" />;
}
