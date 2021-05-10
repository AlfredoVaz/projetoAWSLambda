const aws = require("aws-sdk")

const config = require("./config")

aws.config.update({ region: "us-east-1" })

const s3 = new aws.S3()
const rekognition = new aws.Rekognition()
const dynamoDB = new aws.DynamoDB.DocumentClient({ region: "us-east-1" })

const getNumberInCommon = (a, b) => a.reduce((carry, current) => {
  return b.includes(current) ? carry + 1 : carry
}, 0)

const upload = (key, type, file) => {
  const data = {
    Bucket: config.BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: type,
    ContentEncoding: "base64",
  }

  return s3.putObject(data).promise()
}

const getImageLabels = async (file) => {
  const params = {
    Image: {
      Bytes: file,
    },
    MaxLabels: 30,
    MinConfidence: 65,
  }
  const labels = await rekognition.detectLabels(params).promise()

  return labels.Labels
}

const save = (item) => {
  const params = {
    TableName: config.TABLE_NAME,
    Item: item,
  }

  return dynamoDB.put(params).promise()
}

const getAllImages = async () => {
  const scanned = await dynamoDB.scan({ TableName: config.TABLE_NAME }).promise()

  return scanned.Items
}

const getRelatedImages = (images, source) => {
  const related = images.filter((image) => {
    return getNumberInCommon(image.labels, source.labels) > 2
  })

  return related.sort((a, b) => {
    const aCommons = getNumberInCommon(a.labels, source.labels)
    const bCommons = getNumberInCommon(b.labels, source.labels)

    if (aCommons < bCommons) {
      return 1
    } else if (aCommons > bCommons) {
      return -1
    }

    return 0
  })
}

exports.handler = async (event) => {
  const body = JSON.parse(event.body)
  const file = new Buffer(body.file, "base64")

  await upload(body.key, body.type, file)

  const labels = await getImageLabels(file)
  const item = {
    key: body.key,
    labels: labels.map(label => label.Name),
  }
  const images = await getAllImages()
  const related = await getRelatedImages(images, item)
  
  await save(item)

  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "http://image-recover.s3-website-us-east-1.amazonaws.com",
    },
    body: JSON.stringify({
      success: true,
      item: item,
      results: related,
    }),
  }
}
