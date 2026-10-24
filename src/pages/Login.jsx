import loginImg from "../assets/Images/login.webp"
import Template from "../components/core/Auth/Template"

function Login() {
  return (
    <Template
      title="Welcome back"
      description1="Learn at your own pace and"
      description2="earn certificates you can share."
      image={loginImg}
      formType="login"
    />
  )
}

export default Login
