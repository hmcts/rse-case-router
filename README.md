# RSE Case Router

The Case Router is an API gateway that abstracts several of the CCD APIs and routes incoming requests to different versions of CCD depending on the case type. 

**This project is a prototype and not production ready or complete.**

## Why

There are two reasons:
- To provide a [bounded context](https://martinfowler.com/bliki/BoundedContext.html) for the case domain
- To allow different case types to use their own instance of the CCD microservices 

## Running

```
npm start
```

## License 

MIT
