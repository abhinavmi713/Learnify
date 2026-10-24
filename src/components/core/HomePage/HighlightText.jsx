import React from "react";

const HighlightText = ({text}) => {
  return (
    <span className="bg-gradient-to-r from-yellow-50 to-richblue-300 text-transparent bg-clip-text font-bold">
      {" "}
      {text}
    </span>
  );
};

export default HighlightText;
