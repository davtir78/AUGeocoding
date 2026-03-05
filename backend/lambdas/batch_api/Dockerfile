FROM public.ecr.aws/lambda/python:3.11

COPY requirements.txt .
RUN pip install -r requirements.txt -t ${LAMBDA_TASK_ROOT}

COPY index.py ${LAMBDA_TASK_ROOT}

CMD [ "index.handler" ]
