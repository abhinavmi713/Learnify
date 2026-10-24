import React from "react";
import ContactUsForm from "./ContactUsForm";

const ContactForm = () => {
  return (
    <div className="surface flex flex-col gap-3 p-7 text-richblack-300 lg:p-12">
      <h1 className="text-4xl leading-10 font-semibold text-richblack-5">
        Send us a message
      </h1>
      <p className="">
        Tell us how we can help and we will get back to you by email.
      </p>

      <div className="mt-7">
        <ContactUsForm />
      </div>
    </div>
  );
};

export default ContactForm;
