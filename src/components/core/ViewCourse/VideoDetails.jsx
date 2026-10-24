import Plyr from "plyr"
import "plyr/dist/plyr.css"
import { useEffect, useRef, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useNavigate, useParams } from "react-router-dom"
import { useLocation } from "react-router-dom"

import {
  markLectureAsComplete,
  updateWatchPosition,
} from "../../../services/operations/courseDetailsAPI"
import { updateCompletedLectures } from "../../../slices/viewCourseSlice"
import IconBtn from "../../Common/IconBtn"
import LectureDiscussion from "./LectureDiscussion"
import VideoNotes from "./VideoNotes"

// How often (ms) to persist the playback position while the video plays —
// frequent enough to resume close to where you left off, not so frequent
// that every tick becomes a network request.
const POSITION_SAVE_INTERVAL_MS = 5000

const VideoDetails = () => {
  const { courseId, sectionId, subSectionId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const videoRef = useRef(null)
  const playerRef = useRef(null)
  const lastSavedAtRef = useRef(0)
  const dispatch = useDispatch()
  const { token } = useSelector((state) => state.auth)
  const {
    courseSectionData,
    courseEntireData,
    completedLectures,
    lastWatchedPositions,
  } = useSelector((state) => state.viewCourse)

  const [videoData, setVideoData] = useState([])
  const [previewSource, setPreviewSource] = useState("")
  const [videoEnded, setVideoEnded] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    ;(async () => {
      if (!courseSectionData.length) return
      if (!courseId && !sectionId && !subSectionId) {
        navigate(`/dashboard/enrolled-courses`)
      } else {
        const filteredData = courseSectionData.filter(
          (course) => course._id === sectionId
        )
        const filteredVideoData = filteredData?.[0]?.subSection.filter(
          (data) => data._id === subSectionId
        )
        setVideoData(filteredVideoData[0])
        setPreviewSource(courseEntireData.thumbnail)
        setVideoEnded(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseSectionData, courseEntireData, location.pathname])

  // Set up Plyr fresh for every lecture (simplest correct way to swap sources).
  useEffect(() => {
    if (!videoRef.current || !videoData?.videoUrl) return

    const player = new Plyr(videoRef.current, {
      controls: [
        "play-large",
        "play",
        "progress",
        "current-time",
        "duration",
        "mute",
        "volume",
        "settings",
        "pip",
        "fullscreen",
      ],
      settings: ["speed"],
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
    })
    playerRef.current = player

    const resumePosition = lastWatchedPositions?.find(
      (p) => p.subsection === subSectionId
    )?.position

    const onLoadedMetadata = () => {
      if (resumePosition && resumePosition > 1 && resumePosition < player.duration - 2) {
        player.currentTime = resumePosition
      }
    }
    const onTimeUpdate = () => {
      const now = Date.now()
      if (now - lastSavedAtRef.current > POSITION_SAVE_INTERVAL_MS) {
        lastSavedAtRef.current = now
        updateWatchPosition(
          { courseId, subsectionId: subSectionId, position: Math.floor(player.currentTime) },
          token
        )
      }
    }
    const onEnded = () => {
      setVideoEnded(true)
      updateWatchPosition({ courseId, subsectionId: subSectionId, position: 0 }, token)
    }
    const onPause = () => {
      if (player.currentTime > 0) {
        updateWatchPosition(
          { courseId, subsectionId: subSectionId, position: Math.floor(player.currentTime) },
          token
        )
      }
    }

    player.on("loadedmetadata", onLoadedMetadata)
    player.on("timeupdate", onTimeUpdate)
    player.on("ended", onEnded)
    player.on("pause", onPause)

    return () => {
      player.off("loadedmetadata", onLoadedMetadata)
      player.off("timeupdate", onTimeUpdate)
      player.off("ended", onEnded)
      player.off("pause", onPause)
      player.destroy()
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoData?._id])

  // check if the lecture is the first video of the course
  const isFirstVideo = () => {
    const currentSectionIndx = courseSectionData.findIndex(
      (data) => data._id === sectionId
    )

    const currentSubSectionIndx = courseSectionData[
      currentSectionIndx
    ].subSection.findIndex((data) => data._id === subSectionId)

    if (currentSectionIndx === 0 && currentSubSectionIndx === 0) {
      return true
    } else {
      return false
    }
  }

  // go to the next video
  const goToNextVideo = () => {
    const currentSectionIndx = courseSectionData.findIndex(
      (data) => data._id === sectionId
    )

    const noOfSubsections =
      courseSectionData[currentSectionIndx].subSection.length

    const currentSubSectionIndx = courseSectionData[
      currentSectionIndx
    ].subSection.findIndex((data) => data._id === subSectionId)

    if (currentSubSectionIndx !== noOfSubsections - 1) {
      const nextSubSectionId =
        courseSectionData[currentSectionIndx].subSection[
          currentSubSectionIndx + 1
        ]._id
      navigate(
        `/view-course/${courseId}/section/${sectionId}/sub-section/${nextSubSectionId}`
      )
    } else {
      const nextSectionId = courseSectionData[currentSectionIndx + 1]._id
      const nextSubSectionId =
        courseSectionData[currentSectionIndx + 1].subSection[0]._id
      navigate(
        `/view-course/${courseId}/section/${nextSectionId}/sub-section/${nextSubSectionId}`
      )
    }
  }

  // check if the lecture is the last video of the course
  const isLastVideo = () => {
    const currentSectionIndx = courseSectionData.findIndex(
      (data) => data._id === sectionId
    )

    const noOfSubsections =
      courseSectionData[currentSectionIndx].subSection.length

    const currentSubSectionIndx = courseSectionData[
      currentSectionIndx
    ].subSection.findIndex((data) => data._id === subSectionId)

    if (
      currentSectionIndx === courseSectionData.length - 1 &&
      currentSubSectionIndx === noOfSubsections - 1
    ) {
      return true
    } else {
      return false
    }
  }

  // go to the previous video
  const goToPrevVideo = () => {
    const currentSectionIndx = courseSectionData.findIndex(
      (data) => data._id === sectionId
    )

    const currentSubSectionIndx = courseSectionData[
      currentSectionIndx
    ].subSection.findIndex((data) => data._id === subSectionId)

    if (currentSubSectionIndx !== 0) {
      const prevSubSectionId =
        courseSectionData[currentSectionIndx].subSection[
          currentSubSectionIndx - 1
        ]._id
      navigate(
        `/view-course/${courseId}/section/${sectionId}/sub-section/${prevSubSectionId}`
      )
    } else {
      const prevSectionId = courseSectionData[currentSectionIndx - 1]._id
      const prevSubSectionLength =
        courseSectionData[currentSectionIndx - 1].subSection.length
      const prevSubSectionId =
        courseSectionData[currentSectionIndx - 1].subSection[
          prevSubSectionLength - 1
        ]._id
      navigate(
        `/view-course/${courseId}/section/${prevSectionId}/sub-section/${prevSubSectionId}`
      )
    }
  }

  const handleLectureCompletion = async () => {
    setLoading(true)
    const res = await markLectureAsComplete(
      { courseId: courseId, subsectionId: subSectionId },
      token
    )
    if (res) {
      dispatch(updateCompletedLectures(subSectionId))
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-5 text-richblack-5">
      {!videoData ? (
        <img
          src={previewSource}
          alt="Preview"
          className="h-full w-full rounded-md object-cover"
        />
      ) : (
        <div className="relative overflow-hidden rounded-xl">
          {/* Plyr re-parents the <video> into its own wrapper markup. The key
              lives on this React-owned div so that switching lectures removes
              the whole div; keyed on the <video> itself, React would try to
              remove a node Plyr had moved and crash ("removeChild ... not a
              child of this node"). */}
          <div key={videoData?._id}>
            <video ref={videoRef} playsInline className="plyr-video">
              <source src={videoData?.videoUrl} type="video/mp4" />
            </video>
          </div>
          {/* Render When Video Ends */}
          {videoEnded && (
            <div
              style={{
                backgroundImage:
                  "linear-gradient(to top, rgb(0, 0, 0), rgba(0,0,0,0.7), rgba(0,0,0,0.5), rgba(0,0,0,0.1)",
              }}
              className="full absolute inset-0 z-[100] grid h-full place-content-center font-sans text-white"
            >
              {!completedLectures.includes(subSectionId) && (
                <IconBtn
                  disabled={loading}
                  onclick={() => handleLectureCompletion()}
                  text={!loading ? "Mark As Completed" : "Loading..."}
                  customClasses="text-xl max-w-max px-4 mx-auto"
                />
              )}
              <IconBtn
                disabled={loading}
                onclick={() => {
                  if (playerRef?.current) {
                    playerRef.current.currentTime = 0
                    playerRef.current.play()
                    setVideoEnded(false)
                  }
                }}
                text="Rewatch"
                customClasses="text-xl max-w-max px-4 mx-auto mt-2"
              />
              <div className="mt-10 flex min-w-[250px] justify-center gap-x-4 text-xl">
                {!isFirstVideo() && (
                  <button
                    disabled={loading}
                    onClick={goToPrevVideo}
                    className="blackButton"
                  >
                    Prev
                  </button>
                )}
                {!isLastVideo() && (
                  <button
                    disabled={loading}
                    onClick={goToNextVideo}
                    className="blackButton"
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <h1 className="mt-4 text-3xl font-semibold">{videoData?.title}</h1>
      <p className="pt-2 pb-6">{videoData?.description}</p>

      {videoData?._id && (
        <>
          <VideoNotes
            courseId={courseId}
            subsectionId={videoData._id}
            getCurrentTime={() => playerRef.current?.currentTime || 0}
            onSeek={(t) => {
              if (playerRef.current) {
                playerRef.current.currentTime = t
                playerRef.current.play()
              }
            }}
          />
          <LectureDiscussion courseId={courseId} sectionId={sectionId} subsectionId={videoData._id} />
        </>
      )}
    </div>
  )
}

export default VideoDetails
