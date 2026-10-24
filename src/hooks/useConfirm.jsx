import { useCallback, useState } from "react"

import ConfirmationModal from "../components/Common/ConfirmationModal"

// Promise-based confirmation for destructive actions:
//
//   const [confirm, confirmModal] = useConfirm()
//   if (!(await confirm({ title: "Delete?", body: "This cannot be undone." }))) return
//   ...
//   return <>{...}{confirmModal}</>
export default function useConfirm() {
  const [request, setRequest] = useState(null)

  const confirm = useCallback(
    ({ title, body, confirmText = "Delete", cancelText = "Cancel" }) =>
      new Promise((resolve) => setRequest({ title, body, confirmText, cancelText, resolve })),
    []
  )

  const close = (answer) => {
    request?.resolve(answer)
    setRequest(null)
  }

  const modal = request ? (
    <ConfirmationModal
      modalData={{
        text1: request.title,
        text2: request.body,
        btn1Text: request.confirmText,
        btn2Text: request.cancelText,
        btn1Handler: () => close(true),
        btn2Handler: () => close(false),
      }}
    />
  ) : null

  return [confirm, modal]
}
