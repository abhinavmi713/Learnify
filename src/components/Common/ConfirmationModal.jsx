import IconBtn from "./IconBtn"

export default function ConfirmationModal({ modalData }) {
  return (
    <div className="fixed inset-0 z-[1000] !mt-0 grid place-items-center overflow-auto bg-black/50 backdrop-blur-sm">
      <div role="alertdialog" aria-modal="true" className="surface w-11/12 max-w-[380px] p-6">
        <p className="font-display text-2xl font-bold text-richblack-5">
          {modalData?.text1}
        </p>
        <p className="mt-3 mb-5 leading-6 text-richblack-200">
          {modalData?.text2}
        </p>
        <div className="flex items-center gap-x-4">
          <IconBtn
            onclick={modalData?.btn1Handler}
            text={modalData?.btn1Text}
          />
          <button
            className="cursor-pointer rounded-full border border-richblack-600 px-5 py-2 font-semibold text-richblack-5 hover:bg-richblack-700"
            onClick={modalData?.btn2Handler}
          >
            {modalData?.btn2Text}
          </button>
        </div>
      </div>
    </div>
  )
}
